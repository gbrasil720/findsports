import { expect, mock, test } from 'bun:test'
import { waitlistEntries } from '@findsports_oficial/db/schema/waitlist'
import { eq } from 'drizzle-orm'

import type { Context } from '../context'

/**
 * ONS-25: `inviteDetails` filtrava prazo, ativação, aprovação e cancelamento
 * dentro do WHERE. Zero linha era a única resposta possível, e a tela dizia
 * "Convite inválido ou expirado." para cinco situações diferentes.
 *
 * O que estes casos travam: cada motivo chega ao cliente com nome próprio, o
 * e-mail continua saindo só no caso `valid`, e um convite vencido pode ser
 * reemitido pela própria pessoa — sem que isso aprove ninguém.
 */
function isClearlyDisposableDatabase(url: string | undefined): boolean {
  if (!url || process.env.RUN_DISPOSABLE_DB_TESTS !== '1') return false
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) &&
      /(test|testing|tmp|temp|disposable|ci)/i.test(database)
    )
  } catch {
    return false
  }
}

const integrationTest = isClearlyDisposableDatabase(process.env.DATABASE_URL)
  ? test
  : test.skip

const envios: { kind: string; to: string; url: string }[] = []
let falharEnvio = false

/** Mesmo motivo de `waitlist.confirm.integration.test.ts`: `mock.module` é
 *  global no processo, então só entra quando o arquivo de fato roda. */
function mockarEnvioDeEmail() {
  mock.module('../lib/waitlist-email', () => ({
    waitlistUrl: (path: string, token?: string) =>
      `https://onside.invalid${path}${token ? `?token=${token}` : ''}`,
    sendWaitlistEmail: async (input: {
      kind: string
      to: string
      url: string
    }) => {
      envios.push(input)
      if (falharEnvio) throw new Error('Resend devolveu 500.')
      return { delivered: true }
    }
  }))
}

const contextoPublico = {
  auth: null,
  session: null,
  clientIp: '127.0.0.1'
} as unknown as Context

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000

async function prepararConvite(
  overrides: Partial<typeof waitlistEntries.$inferInsert> = {}
) {
  const [{ db }, { createWaitlistToken }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('../lib/waitlist-workflow')
  ])
  const email = `invite-${crypto.randomUUID()}@integration.invalid`
  const invite = await createWaitlistToken()
  await db.insert(waitlistEntries).values({
    email,
    role: 'fan',
    city: 'Belo Horizonte',
    confirmedAt: new Date(),
    approvedAt: new Date(),
    inviteTokenHash: invite.hash,
    inviteExpiresAt: new Date(Date.now() + SETE_DIAS),
    inviteSentAt: new Date(),
    ...overrides
  })
  return { db, email, invite }
}

async function limpar(email: string) {
  const { db } = await import('@findsports_oficial/db')
  await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email))
}

integrationTest('convite bom devolve `valid` com o e-mail', async () => {
  mockarEnvioDeEmail()
  const { appRouter } = await import('./index')
  const { email, invite } = await prepararConvite()
  try {
    const detalhes = await appRouter
      .createCaller(contextoPublico)
      .waitlist.inviteDetails({ token: invite.token })
    expect(detalhes.status).toBe('valid')
    expect(detalhes).toHaveProperty('email', email)
  } finally {
    await limpar(email)
  }
})

integrationTest(
  'cada recusa tem nome próprio e nenhuma vaza o e-mail',
  async () => {
    mockarEnvioDeEmail()
    const { appRouter } = await import('./index')
    const caller = appRouter.createCaller(contextoPublico)
    const casos = [
      {
        esperado: 'expired',
        overrides: { inviteExpiresAt: new Date(Date.now() - SETE_DIAS) }
      },
      { esperado: 'activated', overrides: { activatedAt: new Date() } },
      { esperado: 'not_approved', overrides: { approvedAt: null } },
      { esperado: 'cancelled', overrides: { cancelledAt: new Date() } }
    ] as const

    for (const caso of casos) {
      const { email, invite } = await prepararConvite(caso.overrides)
      try {
        const detalhes = await caller.waitlist.inviteDetails({
          token: invite.token
        })
        expect(detalhes.status).toBe(caso.esperado)
        expect(detalhes).not.toHaveProperty('email')
      } finally {
        await limpar(email)
      }
    }
  }
)

integrationTest('hash desconhecido é `not_found` e nada mais', async () => {
  mockarEnvioDeEmail()
  const [{ appRouter }, { createWaitlistToken }] = await Promise.all([
    import('./index'),
    import('../lib/waitlist-workflow')
  ])
  const desconhecido = await createWaitlistToken()
  const detalhes = await appRouter
    .createCaller(contextoPublico)
    .waitlist.inviteDetails({ token: desconhecido.token })
  expect(detalhes).toEqual({ status: 'not_found' })
})

integrationTest(
  'reenvio troca o token vencido por um novo de 7 dias',
  async () => {
    mockarEnvioDeEmail()
    const { appRouter } = await import('./index')
    const caller = appRouter.createCaller(contextoPublico)
    const { db, email, invite } = await prepararConvite({
      inviteExpiresAt: new Date(Date.now() - SETE_DIAS)
    })
    try {
      envios.length = 0
      falharEnvio = false
      const resultado = await caller.waitlist.resendInvite({
        token: invite.token
      })
      expect(resultado.sent).toBe(true)
      expect(envios).toHaveLength(1)
      expect(envios[0]?.kind).toBe('invite')
      expect(envios[0]?.to).toBe(email)

      // O link antigo morreu junto com a troca: nada de dois convites vivos.
      const antigo = await caller.waitlist.inviteDetails({
        token: invite.token
      })
      expect(antigo).toEqual({ status: 'not_found' })

      // E o novo, extraído do e-mail que saiu, vale.
      const tokenNovo = new URL(envios[0]?.url ?? '').searchParams.get('token')
      expect(tokenNovo).toBeTruthy()
      const novo = await caller.waitlist.inviteDetails({
        token: tokenNovo as string
      })
      expect(novo.status).toBe('valid')

      const linha = (
        await db
          .select()
          .from(waitlistEntries)
          .where(eq(waitlistEntries.email, email))
      )[0]
      expect(linha?.inviteExpiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now())
    } finally {
      await limpar(email)
    }
  }
)

integrationTest('reenvio não aprova quem não foi aprovado', async () => {
  mockarEnvioDeEmail()
  const { appRouter } = await import('./index')
  const { email, invite } = await prepararConvite({
    approvedAt: null,
    inviteExpiresAt: new Date(Date.now() - SETE_DIAS)
  })
  try {
    envios.length = 0
    await expect(
      appRouter
        .createCaller(contextoPublico)
        .waitlist.resendInvite({ token: invite.token })
    ).rejects.toThrow('Este link não pode gerar um convite novo.')
    expect(envios).toHaveLength(0)
  } finally {
    await limpar(email)
  }
})

integrationTest(
  'falha de envio devolve o token antigo para o dono do link',
  async () => {
    mockarEnvioDeEmail()
    const { appRouter } = await import('./index')
    const caller = appRouter.createCaller(contextoPublico)
    const { email, invite } = await prepararConvite({
      inviteExpiresAt: new Date(Date.now() - SETE_DIAS)
    })
    try {
      envios.length = 0
      falharEnvio = true
      await expect(
        caller.waitlist.resendInvite({ token: invite.token })
      ).rejects.toThrow('Não foi possível enviar o convite.')

      // Sem a devolução, o convite novo não teria chegado e o antigo já não
      // casaria com hash nenhum: o botão "Reenviar" ficaria sem alvo.
      falharEnvio = false
      const detalhes = await caller.waitlist.inviteDetails({
        token: invite.token
      })
      expect(detalhes.status).toBe('expired')

      const segunda = await caller.waitlist.resendInvite({
        token: invite.token
      })
      expect(segunda.sent).toBe(true)
    } finally {
      falharEnvio = false
      await limpar(email)
    }
  }
)
