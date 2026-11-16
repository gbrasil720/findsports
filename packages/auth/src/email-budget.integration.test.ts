import { afterEach, expect, spyOn, test } from 'bun:test'
import { refundWindowAttempt } from '@findsports_oficial/db/rate-limit'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { setBackgroundTaskHandler } from './background'
import {
  EMAIL_BUDGET,
  type EmailBudgetExceeded,
  type EmailCategory,
  emailBudgetDay,
  emailBudgetHash,
  emailCategoryExhausted,
  reserveEmailSend
} from './email-budget'

/**
 * O orçamento de e-mail contra a tabela `rate_limit` de verdade. Os testes
 * dos baldes usam um dia fixo do passado, para não disputar as chaves de hoje
 * com os testes do `packages/api` que rodam ao mesmo tempo; os de ponta a
 * ponta (pelo `auth.handler`) usam hoje e devolvem o que gastaram.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const PAST = new Date('2001-01-01T12:00:00Z')

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function randomIp() {
  const octet = () => Math.floor(Math.random() * 250) + 1
  return `10.${octet()}.${octet()}.${octet()}`
}

function address() {
  return `${crypto.randomUUID()}@integration.invalid`
}

async function setup() {
  const [{ db, eq, or, sql }, { rateLimit }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/schema/auth')
  ])
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const ips: string[] = []
  cleanups.push(async () => {
    warn.mockRestore()
    await db.delete(rateLimit).where(
      or(
        sql`${rateLimit.key} like ${`${emailBudgetDay(PAST)}%`}`,
        sql`${rateLimit.key} like 'email:ip:2001-01-01:%'`,
        // Só este arquivo grava `email:to:` (o api não manda e-mail de auth).
        sql`${rateLimit.key} like 'email:to:%'`
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

  /** Enche o balde do dia, como se ele já tivesse sido gasto. */
  async function fill(category: EmailCategory) {
    const value = {
      count: EMAIL_BUDGET.categoryDaily[category],
      lastRequest: Date.now()
    }
    await db
      .insert(rateLimit)
      .values({
        id: crypto.randomUUID(),
        key: `${emailBudgetDay(PAST)}:${category}`,
        ...value
      })
      .onConflictDoUpdate({ target: rateLimit.key, set: value })
  }

  function ip() {
    const value = randomIp()
    ips.push(value)
    return value
  }

  return { count, fill, ip }
}

function send(category: EmailCategory, to = address(), ip?: string) {
  return reserveEmailSend(category, to, ip, PAST)
}

async function scopeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  )
  expect((error as Error | null)?.name).toBe('EmailBudgetExceeded')
  return (error as EmailBudgetExceeded).scope
}

test('os baldes do dia somam no máximo o total abaixo da cota', () => {
  const sum = Object.values(EMAIL_BUDGET.categoryDaily).reduce(
    (total, value) => total + value,
    0
  )
  expect(sum).toBeLessThanOrEqual(EMAIL_BUDGET.daily)
  expect(EMAIL_BUDGET.daily).toBeLessThan(100)
  // Um IP só não esgota nenhum balde aberto sem login.
  for (const category of ['signup', 'verify', 'reset'] as const) {
    expect(EMAIL_BUDGET.perIpDaily).toBeLessThan(
      EMAIL_BUDGET.categoryDaily[category]
    )
  }
})

integrationTest(
  'reset por endereço conta por IP: o atacante para em 3, a vítima de outro IP recebe',
  async () => {
    const { ip, count } = await setup()
    const victim = address()
    const attacker = ip()

    for (let i = 0; i < EMAIL_BUDGET.perRecipient.max; i++) {
      await send('reset', victim, attacker)
    }
    expect(await scopeOf(send('reset', victim.toUpperCase(), attacker))).toBe(
      'recipient'
    )
    // A recusa não gasta o balde do dia.
    expect(await count(`${emailBudgetDay(PAST)}:reset`)).toBe(
      EMAIL_BUDGET.perRecipient.max
    )

    await send('reset', victim, ip())
    // Verificação tem o seu contador: o reset gasto não a trava.
    await send('verify', victim, attacker)
  }
)

integrationTest(
  'a chave em rate_limit não guarda o e-mail nem o IP (LGPD)',
  async () => {
    const { ip } = await setup()
    const { db, sql } = await import('@findsports_oficial/db')
    const { rateLimit } = await import('@findsports_oficial/db/schema/auth')
    const victim = address()
    const from = ip()

    await send('reset', victim, from)

    const keys = (
      await db
        .select({ key: rateLimit.key })
        .from(rateLimit)
        .where(
          sql`${rateLimit.key} like 'email:to:%' or ${rateLimit.key} like 'email:ip:%'`
        )
    ).map((row) => row.key)
    expect(keys).toContain(`email:to:reset:${emailBudgetHash(victim, from)}`)
    expect(keys).toContain(`email:ip:2001-01-01:${emailBudgetHash(from)}`)
    for (const key of keys) {
      expect(key).not.toContain(victim)
      expect(key).not.toContain(victim.split('@')[0] ?? victim)
      expect(key).not.toContain(from)
    }
  }
)

integrationTest(
  'teto por IP no dia, somando cadastro, verificação e reset',
  async () => {
    const { ip, count } = await setup()
    const attacker = ip()
    const categories = ['signup', 'verify', 'reset'] as const

    for (let i = 0; i < EMAIL_BUDGET.perIpDaily; i++) {
      await send(
        categories[i % categories.length] ?? 'signup',
        address(),
        attacker
      )
    }
    expect(await scopeOf(send('signup', address(), attacker))).toBe('ip')
    expect(await count(`${emailBudgetDay(PAST)}:signup`)).toBe(
      Math.ceil(EMAIL_BUDGET.perIpDaily / categories.length)
    )
    // Outro IP segue.
    await send('signup', address(), ip())
    // Sem IP (servidor, admin) só o balde conta.
    await send('verify')
  }
)

integrationTest(
  'flood de cadastro não come reset, verificação nem os avisos da segunda',
  async () => {
    const { fill, ip } = await setup()
    await fill('signup')

    expect(await scopeOf(send('signup', address(), ip()))).toBe('category')
    await send('reset', address(), ip())
    await send('verify', address(), ip())
    await send('notices')

    // Mesmo com todos os baldes abertos sem login esgotados.
    await fill('reset')
    await fill('verify')
    expect(await scopeOf(send('reset', address(), ip()))).toBe('category')
    await send('notices')
    await send('feedback')
    await send('export')
  }
)

integrationTest('o admin vê que o balde da categoria acabou', async () => {
  const { fill } = await setup()
  expect(await emailCategoryExhausted('verify', PAST)).toBe(false)
  await fill('verify')
  expect(await emailCategoryExhausted('verify', PAST)).toBe(true)
  expect(await emailCategoryExhausted('reset', PAST)).toBe(false)
})

/** `auth.handler` com o `fetch` da API de e-mail dublado. */
async function httpSetup() {
  const [{ db, eq, sql }, { rateLimit, user }, { auth }, { env }] =
    await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('./index'),
      import('@findsports_oficial/env/server')
    ])
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
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
  const emails: string[] = []
  const ips: string[] = []
  /** O que cada teste gastou dos baldes de hoje, devolvido no fim. */
  const spent: Partial<Record<EmailCategory, number>> = {}

  cleanups.push(async () => {
    setBackgroundTaskHandler(() => {})
    fetchSpy.mockRestore()
    warn.mockRestore()
    keys.EMAIL_API_KEY = undefined
    keys.EMAIL_FROM = undefined
    for (const email of emails) {
      await db.delete(user).where(eq(user.email, email))
    }
    for (const ip of ips) {
      await db
        .delete(rateLimit)
        .where(
          sql`${rateLimit.key} like ${`%${ip}%`} or ${rateLimit.key} like ${`email:ip:%:${emailBudgetHash(ip)}`} or ${rateLimit.key} like 'email:to:%'`
        )
    }
    for (const [category, amount] of Object.entries(spent)) {
      await refundWindowAttempt(
        `${emailBudgetDay(new Date())}:${category}`,
        amount
      )
    }
  })

  // O envio do better-auth vai para depois da resposta (`backgroundTasks`):
  // cada `post` espera o seu terminar, para contar o que saiu.
  const pending: Promise<unknown>[] = []
  setBackgroundTaskHandler((promise) => pending.push(promise))

  async function post(path: string, ip: string, body: unknown) {
    if (!ips.includes(ip)) ips.push(ip)
    const response = await auth.handler(
      new Request(`${baseUrl}/api/auth${path}`, {
        method: 'POST',
        headers: {
          origin: baseUrl,
          'content-type': 'application/json',
          'x-forwarded-for': ip
        },
        body: JSON.stringify(body)
      })
    )
    await Promise.allSettled(pending.splice(0))
    return response
  }

  async function verifiedUser() {
    const email = address()
    emails.push(email)
    await db.insert(user).values({
      id: crypto.randomUUID(),
      name: 'Cota de e-mail',
      email,
      emailVerified: true,
      role: 'fan'
    })
    return email
  }

  /**
   * Zera o rate limit do better-auth (3 por minuto por IP e caminho), para o
   * teste chegar ao do orçamento, que é por hora.
   */
  async function clearAuthRateLimit(ip: string) {
    await db
      .delete(rateLimit)
      .where(
        sql`${rateLimit.key} like ${`%${ip}%`} and ${rateLimit.key} not like 'email:%'`
      )
  }

  return { post, sent, emails, spent, verifiedUser, clearAuthRateLimit }
}

integrationTest(
  'cadastro, dois logins sem verificar e um reenvio: os quatro e-mails saem',
  async () => {
    const { post, sent, emails, spent } = await httpSetup()
    const email = address()
    emails.push(email)
    const ip = randomIp()
    const password = 'Senha-de-teste-cota!'

    const signUp = await post('/sign-up/email', ip, {
      name: 'Cota',
      email,
      password
    })
    expect(signUp.status).toBe(200)
    for (let i = 0; i < 2; i++) {
      const signIn = await post('/sign-in/email', ip, { email, password })
      expect(signIn.status).toBe(403)
    }
    const resend = await post('/send-verification-email', ip, { email })
    expect(resend.status).toBe(200)
    spent.signup = 1
    spent.verify = 3

    expect(sent).toEqual([email, email, email, email])

    // O quarto de conta existente, do mesmo IP na hora, sai calado.
    const extra = await post('/send-verification-email', ip, { email })
    expect(extra.status).toBe(200)
    expect(sent).toHaveLength(4)
  }
)

integrationTest(
  'reset pedido 4 vezes do mesmo IP: 3 e-mails e a mesma resposta; a vítima de outro IP recebe',
  async () => {
    const { post, sent, spent, verifiedUser, clearAuthRateLimit } =
      await httpSetup()
    const email = await verifiedUser()
    const attacker = randomIp()

    for (let i = 0; i < 4; i++) {
      await clearAuthRateLimit(attacker)
      const response = await post('/request-password-reset', attacker, {
        email,
        redirectTo: '/reset-password'
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status: true })
    }
    expect(sent).toEqual([email, email, email])

    const victim = await post('/request-password-reset', randomIp(), {
      email,
      redirectTo: '/reset-password'
    })
    expect(victim.status).toBe(200)
    spent.reset = 4
    expect(sent).toHaveLength(4)
  }
)
