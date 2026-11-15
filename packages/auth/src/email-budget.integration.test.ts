import { afterEach, expect, spyOn, test } from 'bun:test'
import { refundWindowAttempt } from '@findsports_oficial/db/rate-limit'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  EMAIL_BUDGET,
  EmailBudgetExceeded,
  emailBudgetDay,
  reserveEmailSend
} from './email-budget'

/**
 * O orçamento de e-mail contra a tabela `rate_limit` de verdade. Os testes do
 * total usam um dia fixo do passado, para não disputar as chaves de hoje com
 * os testes do `packages/api` que rodam ao mesmo tempo.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const PAST = new Date('2001-01-01T12:00:00Z')

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function setup() {
  const [{ db, eq, or, sql }, { rateLimit }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/schema/auth')
  ])
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const recipient = `${crypto.randomUUID()}@integration.invalid`
  cleanups.push(async () => {
    warn.mockRestore()
    await db
      .delete(rateLimit)
      .where(
        or(
          sql`${rateLimit.key} like ${`${emailBudgetDay(PAST)}%`}`,
          eq(rateLimit.key, `email:to:${recipient}`)
        )
      )
  })

  async function count(key: string) {
    const [row] = await db
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(eq(rateLimit.key, key))
    return row?.count
  }

  /** Põe o contador do dia em `value`, como se o dia já tivesse gastado. */
  async function preset(key: string, value: number) {
    await db.insert(rateLimit).values({
      id: crypto.randomUUID(),
      key,
      count: value,
      lastRequest: Date.now()
    })
  }

  return { recipient, count, preset }
}

async function scopeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  )
  expect(error).toBeInstanceOf(EmailBudgetExceeded)
  return (error as EmailBudgetExceeded).scope
}

integrationTest(
  'verificação e reset: no máximo 3 por endereço por hora, sem diferença de maiúsculas',
  async () => {
    const { recipient, count } = await setup()
    const day = emailBudgetDay(PAST)

    for (let i = 0; i < EMAIL_BUDGET.perRecipient.max; i++) {
      await reserveEmailSend('auth', recipient, PAST)
    }
    expect(
      await scopeOf(reserveEmailSend('auth', recipient.toUpperCase(), PAST))
    ).toBe('recipient')

    // A recusa não gasta o total do dia nem passa do teto do endereço.
    expect(await count(day)).toBe(EMAIL_BUDGET.perRecipient.max)
    expect(await count(`email:to:${recipient}`)).toBe(
      EMAIL_BUDGET.perRecipient.max
    )
  }
)

integrationTest(
  'o total do dia guarda a reserva da entrada: o resto para antes, auth vai até o fim',
  async () => {
    const { count, preset } = await setup()
    const day = emailBudgetDay(PAST)
    const othersMax = EMAIL_BUDGET.daily - EMAIL_BUDGET.authReserve
    await preset(day, othersMax - 1)

    await reserveEmailSend('notices', 'bar@integration.invalid', PAST)
    expect(
      await scopeOf(
        reserveEmailSend('notices', 'bar@integration.invalid', PAST)
      )
    ).toBe('daily')
    expect(await count(day)).toBe(othersMax)

    // Verificação e reset seguem até o total, cada uma para um endereço.
    for (let sent = othersMax; sent < EMAIL_BUDGET.daily; sent++) {
      await reserveEmailSend(
        'auth',
        `${crypto.randomUUID()}@integration.invalid`,
        PAST
      )
    }
    const last = `${crypto.randomUUID()}@integration.invalid`
    expect(await scopeOf(reserveEmailSend('auth', last, PAST))).toBe('daily')
    expect(await count(day)).toBe(EMAIL_BUDGET.daily)
    // Recusado no total, o endereço também não fica com a tentativa.
    expect(await count(`email:to:${last}`)).toBe(0)
  }
)

integrationTest(
  'feedback tem teto próprio no dia, abaixo do total',
  async () => {
    const { count, preset } = await setup()
    const day = emailBudgetDay(PAST)
    const feedbackMax = EMAIL_BUDGET.categoryDaily.feedback ?? 0
    expect(feedbackMax).toBeGreaterThan(0)
    await preset(`${day}:feedback`, feedbackMax)

    expect(
      await scopeOf(
        reserveEmailSend('feedback', 'caixa@integration.invalid', PAST)
      )
    ).toBe('category')
    expect(await count(day)).toBeUndefined()
    // Outra categoria não sente o teto do feedback.
    await reserveEmailSend('export', 'fa@integration.invalid', PAST)
    expect(await count(day)).toBe(1)
  }
)

integrationTest(
  'reset pedido 4 vezes para o mesmo endereço: 3 e-mails, e a resposta não muda',
  async () => {
    const [{ db, eq }, { rateLimit, user }, { auth }, { env }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('@findsports_oficial/db/schema/auth'),
        import('./index'),
        import('@findsports_oficial/env/server')
      ])
    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    await db.insert(user).values({
      id,
      name: 'Cota de e-mail',
      email,
      emailVerified: true,
      role: 'fan'
    })

    const keys = env as { EMAIL_API_KEY?: string; EMAIL_FROM?: string }
    keys.EMAIL_API_KEY = 're_teste'
    keys.EMAIL_FROM = 'nao-responda@mail.onside.sh'
    const sent: string[] = []
    const real = globalThis.fetch
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url !== `${env.EMAIL_API_URL}/emails`) return real(input, init)
      sent.push(JSON.parse(String(init?.body)).to[0])
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    cleanups.push(async () => {
      fetchSpy.mockRestore()
      warn.mockRestore()
      keys.EMAIL_API_KEY = undefined
      keys.EMAIL_FROM = undefined
      await db.delete(user).where(eq(user.id, id))
      await db.delete(rateLimit).where(eq(rateLimit.key, `email:to:${email}`))
      // O total de hoje: devolve só o que este teste gastou.
      await refundWindowAttempt(emailBudgetDay(new Date()), sent.length)
    })

    for (let i = 0; i < 4; i++) {
      const response = await auth.api.requestPasswordReset({
        body: { email, redirectTo: '/reset-password' }
      })
      expect(response.status).toBe(true)
    }
    expect(sent).toEqual([email, email, email])
  }
)
