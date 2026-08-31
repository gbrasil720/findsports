import { expect, mock, test } from 'bun:test'
import { waitlistEntries } from '@findsports_oficial/db/schema/waitlist'
import { eq } from 'drizzle-orm'

import type { Context } from '../context'

/**
 * ONS-46: a confirmação apagava `confirmation_token_hash` e só depois mandava
 * o e-mail `joined`. Uma falha de entrega devolvia erro com a inscrição já
 * confirmada, e reabrir o mesmo link dizia "Link inválido ou expirado".
 *
 * O que estes casos travam: confirmar é idempotente, uma entrega falha não
 * derruba a confirmação, reabrir o link reenvia — e, uma vez entregue, não
 * reenvia mais.
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
let falharEnvio = true

/**
 * O mock entra dentro do teste, não no topo do arquivo: `mock.module` é
 * global no processo do bun, e trocar o módulo de e-mail para todo mundo
 * quando este arquivo nem roda (banco descartável ausente) contaminaria as
 * outras suítes.
 */
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

async function lerInscrição(email: string) {
  const { db } = await import('@findsports_oficial/db')
  const linhas = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, email))
  const linha = linhas[0]
  if (!linha) throw new Error(`inscrição ${email} sumiu do banco`)
  return linha
}

const contextoPublico = {
  auth: null,
  session: null,
  clientIp: '127.0.0.1'
} as unknown as Context

integrationTest(
  'confirmação sobrevive à falha do e-mail e o link continua válido',
  async () => {
    mockarEnvioDeEmail()
    const [{ db }, { appRouter }, { createWaitlistToken }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index'),
      import('../lib/waitlist-workflow')
    ])

    const email = `confirm-${crypto.randomUUID()}@integration.invalid`
    const confirmation = await createWaitlistToken()
    await db.insert(waitlistEntries).values({
      email,
      role: 'fan',
      city: 'Cidade antiga',
      pendingRole: 'fan',
      pendingCity: 'Cidade nova',
      pendingPhone: '11999999999',
      confirmationTokenHash: confirmation.hash,
      confirmationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    })

    const caller = appRouter.createCaller(contextoPublico)
    try {
      envios.length = 0
      falharEnvio = true

      // 1. O provedor falha. A confirmação foi persistida mesmo assim.
      const primeira = await caller.waitlist.confirm({
        token: confirmation.token
      })
      expect(primeira.confirmed).toBe(true)
      expect(primeira.emailSent).toBe(false)
      expect(envios).toHaveLength(1)

      const apósFalha = await lerInscrição(email)
      expect(apósFalha.confirmedAt).not.toBeNull()
      expect(apósFalha.city).toBe('Cidade nova')
      // O hash fica na linha: é ele que torna reabrir o link idempotente.
      expect(apósFalha.confirmationTokenHash).toBe(confirmation.hash)
      expect(apósFalha.confirmationConsumedAt).not.toBeNull()
      expect(apósFalha.joinedSentAt).toBeNull()
      expect(apósFalha.joinedError).toBe('Resend devolveu 500.')

      // 2. Reabrir o mesmo link: sucesso, e reenvia porque nada foi entregue.
      falharEnvio = false
      const segunda = await caller.waitlist.confirm({
        token: confirmation.token
      })
      expect(segunda.confirmed).toBe(true)
      expect(segunda.emailSent).toBe(true)
      expect(segunda.waitlistId).toBe(primeira.waitlistId)
      expect(envios).toHaveLength(2)

      // 3. Já entregue: reabrir confirma de novo, sem mandar outra mensagem.
      const terceira = await caller.waitlist.confirm({
        token: confirmation.token
      })
      expect(terceira.confirmed).toBe(true)
      expect(terceira.emailSent).toBe(true)
      expect(envios).toHaveLength(2)

      const final = await lerInscrição(email)
      expect(final.joinedSentAt).not.toBeNull()
      expect(final.joinedError).toBeNull()
      expect(final.joinedClaimedAt).toBeNull()
    } finally {
      await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email))
    }
  }
)

integrationTest('token desconhecido continua sendo recusado', async () => {
  mockarEnvioDeEmail()
  const [{ appRouter }, { createWaitlistToken }] = await Promise.all([
    import('./index'),
    import('../lib/waitlist-workflow')
  ])
  const caller = appRouter.createCaller(contextoPublico)
  const desconhecido = await createWaitlistToken()

  await expect(
    caller.waitlist.confirm({ token: desconhecido.token })
  ).rejects.toThrow('Link inválido ou expirado.')
})
