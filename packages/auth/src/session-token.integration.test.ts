import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const password = 'Senha-de-teste-150!'

async function setup() {
  // `index.ts` instancia o cliente da Dodo no import; o teste não o usa.
  process.env.DODO_PAYMENTS_API_KEY ||= 'test'
  const [{ db, inArray, sql }, { account, rateLimit, user }, { auth }] =
    await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('./index')
    ])
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
  const passwordHash = await (await auth.$context).password.hash(password)
  const userIds: string[] = []

  async function createUser(role: 'fan' | 'admin' = 'fan') {
    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    await db.insert(user).values({
      id,
      name: 'Sessões WEB-150',
      email,
      emailVerified: true,
      role,
      onboardingCompleted: true
    })
    userIds.push(id)
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash
    })
    return { id, email }
  }

  // IP próprio por execução: o rate limit do sign-in (3 por 10s, no banco)
  // é por IP, e rodar o teste de novo em seguida esbarraria nele.
  const octet = () => Math.floor(Math.random() * 256)
  const clientIp = `10.${octet()}.${octet()}.${octet()}`

  // Aplica o `Set-Cookie` da resposta sobre o cookie enviado, por nome.
  function withSetCookies(cookie: string, response: Response) {
    const jar = new Map<string, string>()
    const setCookies = response.headers
      .getSetCookie()
      .map((c) => c.slice(0, c.indexOf(';')))
    for (const pair of [...cookie.split('; '), ...setCookies]) {
      if (pair) jar.set(pair.slice(0, pair.indexOf('=')), pair)
    }
    return [...jar.values()].join('; ')
  }

  async function call<T>(cookie: string, path: string, body?: unknown) {
    const response = await auth.handler(
      new Request(`${baseUrl}/api/auth${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          cookie,
          origin: baseUrl,
          'content-type': 'application/json',
          'x-forwarded-for': clientIp
        },
        body: body ? JSON.stringify(body) : undefined
      })
    )
    expect(response.status).toBe(200)
    return {
      data: (await response.json()) as T,
      cookie: withSetCookies(cookie, response)
    }
  }

  // O cookie leva também o cookie cache, para o get-session passar pelo
  // caminho que lê a sessão do cookie e não do banco.
  const signIn = (email: string) =>
    call<object>('', '/sign-in/email', { email, password })

  async function cleanup() {
    await db.delete(user).where(inArray(user.id, userIds))
    await db
      .delete(rateLimit)
      .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
  }

  return { createUser, call, signIn, cleanup }
}

integrationTest(
  'get-session e list-sessions não entregam token; revogar é pelo id (WEB-150)',
  async () => {
    const { createUser, call, signIn, cleanup } = await setup()

    type Session = { id: string }
    const getSession = async (cookie: string, query = '') =>
      (await call<{ session: Session } | null>(cookie, `/get-session${query}`))
        .data
    const listSessionIds = async (cookie: string) =>
      (await call<Session[]>(cookie, '/list-sessions')).data.map(({ id }) => id)

    const owner = await createUser()
    const stranger = await createUser()
    try {
      const { cookie: cookieA } = await signIn(owner.email)
      const { cookie: cookieB } = await signIn(owner.email)
      const { cookie: cookieC } = await signIn(stranger.email)

      for (const query of ['', '?disableCookieCache=true']) {
        const current = await getSession(cookieA, query)
        expect(current?.session.id).toBeString()
        expect(current?.session).not.toHaveProperty('token')
      }

      const { data: sessions } = await call<Session[]>(
        cookieA,
        '/list-sessions'
      )
      expect(sessions).toHaveLength(2)
      for (const item of sessions) {
        expect(item.id).toBeString()
        expect(item).not.toHaveProperty('token')
      }

      const idA = String((await getSession(cookieA))?.session.id)
      const idB = String((await getSession(cookieB))?.session.id)

      // Outra conta não derruba a sessão de A.
      await call(cookieC, '/revoke-session-by-id', { id: idA })
      expect(await listSessionIds(cookieA)).toContain(idA)

      await call(cookieA, '/revoke-session-by-id', { id: idB })
      expect(await listSessionIds(cookieA)).toEqual([idA])
      expect(await getSession(cookieB, '?disableCookieCache=true')).toBeNull()
    } finally {
      await cleanup()
    }
  }
)

integrationTest(
  'login, troca de senha e rotas de admin não entregam token',
  async () => {
    const { createUser, call, signIn, cleanup } = await setup()

    // Lê do banco: prova que o cookie, e não o corpo, carrega a sessão.
    const userIdOf = async (cookie: string) =>
      (
        await call<{ user: { id: string } }>(
          cookie,
          '/get-session?disableCookieCache=true'
        )
      ).data.user.id

    const admin = await createUser('admin')
    const fan = await createUser()
    try {
      // Login: a resposta não leva o token, mas o cookie httpOnly autentica.
      const signedIn = await signIn(admin.email)
      expect(signedIn.data).not.toHaveProperty('token')
      const adminCookie = signedIn.cookie
      expect(await userIdOf(adminCookie)).toBe(admin.id)

      const listed = await call<{ sessions: object[] }>(
        adminCookie,
        '/admin/list-user-sessions',
        { userId: admin.id }
      )
      expect(listed.data.sessions).toHaveLength(1)
      for (const item of listed.data.sessions) {
        expect(item).toHaveProperty('id')
        expect(item).not.toHaveProperty('token')
      }

      // Impersonação continua trocando a sessão pelo cookie.
      const impersonated = await call<{ session: object }>(
        adminCookie,
        '/admin/impersonate-user',
        { userId: fan.id }
      )
      expect(impersonated.data.session).not.toHaveProperty('token')
      expect(await userIdOf(impersonated.cookie)).toBe(fan.id)

      const stopped = await call<{ session: object }>(
        impersonated.cookie,
        '/admin/stop-impersonating',
        {}
      )
      expect(stopped.data.session).not.toHaveProperty('token')
      expect(await userIdOf(stopped.cookie)).toBe(admin.id)

      const changed = await call(adminCookie, '/change-password', {
        currentPassword: password,
        newPassword: `${password}-novo`,
        revokeOtherSessions: true
      })
      expect(changed.data).not.toHaveProperty('token')
    } finally {
      await cleanup()
    }
  }
)
