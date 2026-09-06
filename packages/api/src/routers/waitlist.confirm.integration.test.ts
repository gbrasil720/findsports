import { expect, mock, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { waitlistEntries } from '@findsports_oficial/db/schema/waitlist'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

import type { Context } from '../context'

/**
 * ONS-46: a confirmação apagava `confirmation_token_hash` e só depois mandava
 * o e-mail `joined`. Uma falha de entrega devolvia erro com a inscrição já
 * confirmada, e reabrir o mesmo link dizia "Link inválido ou expirado".
 *
 * O que estes casos travam: confirmar é idempotente, uma entrega falha não
 * derruba a confirmação, reabrir o link reenvia — e, uma vez entregue, não
 * reenvia mais.
 *
 * ONS-26 acrescentou a recusa com causa: expirado, cancelado e inexistente
 * deixam de sair pela mesma frase.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

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

  const recusa = await caller.waitlist.confirm({ token: desconhecido.token })
  expect(recusa.confirmed).toBe(false)
  expect(recusa.confirmed === false && recusa.reason).toBe('invalid')
})

/**
 * ONS-26: recusar sem dizer a causa mandava para a página inicial quem só
 * precisava refazer o formulário — e chamava de link morto o link expirado.
 */
integrationTest('link expirado se separa de link inexistente', async () => {
  mockarEnvioDeEmail()
  const [{ db }, { appRouter }, { createWaitlistToken }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index'),
    import('../lib/waitlist-workflow')
  ])

  const email = `expirado-${crypto.randomUUID()}@integration.invalid`
  const confirmation = await createWaitlistToken()
  await db.insert(waitlistEntries).values({
    email,
    role: 'fan',
    city: 'Cidade antiga',
    pendingRole: 'fan',
    pendingCity: 'Cidade nova',
    confirmationTokenHash: confirmation.hash,
    confirmationExpiresAt: new Date(Date.now() - 60 * 1000)
  })

  const caller = appRouter.createCaller(contextoPublico)
  try {
    const recusa = await caller.waitlist.confirm({ token: confirmation.token })
    expect(recusa.confirmed).toBe(false)
    expect(recusa.confirmed === false && recusa.reason).toBe('expired')
    // A recusa não confirma: a inscrição segue pendente.
    expect((await lerInscrição(email)).confirmedAt).toBeNull()
  } finally {
    await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email))
  }
})

integrationTest(
  'quem saiu da lista ouve isso, não "link inválido"',
  async () => {
    mockarEnvioDeEmail()
    const [{ db }, { appRouter }, { createWaitlistToken }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index'),
      import('../lib/waitlist-workflow')
    ])

    const email = `cancelado-${crypto.randomUUID()}@integration.invalid`
    const confirmation = await createWaitlistToken()
    const agora = new Date()
    await db.insert(waitlistEntries).values({
      email,
      role: 'fan',
      city: 'Cidade nova',
      confirmationTokenHash: confirmation.hash,
      confirmationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      confirmationConsumedAt: agora,
      confirmedAt: agora,
      cancelledAt: agora
    })

    const caller = appRouter.createCaller(contextoPublico)
    try {
      const recusa = await caller.waitlist.confirm({
        token: confirmation.token
      })
      expect(recusa.confirmed).toBe(false)
      expect(recusa.confirmed === false && recusa.reason).toBe('cancelled')
    } finally {
      await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email))
    }
  }
)

/**
 * WEB-55: entrar autenticado não invalidava a confirmação pendente — o link
 * antigo continuava válido e, aberto depois, reaplicava os `pending_*` do
 * formulário anônimo por cima da inscrição autenticada.
 */
integrationTest(
  'join autenticado encerra a confirmação pendente e o link antigo não reverte',
  async () => {
    mockarEnvioDeEmail()
    // Sem tocar no rate limit compartilhado: cada execução de `join`
    // incrementaria `waitlist:ip:127.0.0.1` no banco de dev e envenenaria as
    // janelas dos demais testes de integração.
    mock.module('../lib/waitlist-rate-limit', () => ({
      consumirLimitesWaitlist: async () => ({
        allowed: true,
        retryAfterMs: 0,
        count: 0
      })
    }))
    const [{ db }, { appRouter }, { createWaitlistToken }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index'),
      import('../lib/waitlist-workflow')
    ])

    const email = `revert-${crypto.randomUUID()}@integration.invalid`
    const confirmation = await createWaitlistToken()

    // Estado pré-existente: inscrição feita por formulário anônimo, com o
    // link de confirmação ainda válido apontando para os `pending_*`.
    await db.insert(waitlistEntries).values({
      email,
      role: 'fan',
      city: 'Cidade antiga',
      pendingRole: 'fan',
      pendingCity: 'Cidade antiga',
      pendingPhone: '11999999999',
      confirmationTokenHash: confirmation.hash,
      confirmationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    })

    const caller = appRouter.createCaller({
      auth: null,
      clientIp: '127.0.0.1',
      session: {
        session: { id: 's', userId: 'u', token: 't' },
        user: {
          id: 'u',
          email,
          emailVerified: true,
          role: 'pub',
          onboardingCompleted: true,
          searchRadiusKm: 3,
          twoFactorEnabled: false
        }
      }
    } as unknown as Context)

    try {
      const autenticada = await caller.waitlist.join({
        role: 'pub',
        email,
        city: 'Cidade nova',
        pubName: 'Bar da nova'
      })
      expect(autenticada.status).toBe('confirmed')

      // A inscrição autenticada valeu e a confirmação pendente morreu junto.
      const apósJoin = await lerInscrição(email)
      expect(apósJoin.role).toBe('pub')
      expect(apósJoin.city).toBe('Cidade nova')
      expect(apósJoin.pubName).toBe('Bar da nova')
      expect(apósJoin.confirmedAt).not.toBeNull()
      expect(apósJoin.confirmationTokenHash).toBeNull()
      expect(apósJoin.confirmationExpiresAt).toBeNull()
      expect(apósJoin.confirmationConsumedAt).toBeNull()
      expect(apósJoin.pendingRole).toBeNull()
      expect(apósJoin.pendingCity).toBeNull()
      expect(apósJoin.pendingPhone).toBeNull()
      expect(apósJoin.pendingPubName).toBeNull()

      // O link antigo deixou de encontrar a linha: recusado, sem reverter.
      const recusa = await caller.waitlist.confirm({
        token: confirmation.token
      })
      expect(recusa.confirmed).toBe(false)
      expect(recusa.confirmed === false && recusa.reason).toBe('invalid')

      const final = await lerInscrição(email)
      expect(final.role).toBe('pub')
      expect(final.city).toBe('Cidade nova')
    } finally {
      await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email))
    }
  }
)
