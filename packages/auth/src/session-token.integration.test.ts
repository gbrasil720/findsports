import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'get-session e list-sessions não entregam token; revogar é pelo id (WEB-150)',
  async () => {
    // `index.ts` instancia o cliente da Dodo no import; o teste não o usa.
    process.env.DODO_PAYMENTS_API_KEY ||= 'test'
    const [{ db, eq, sql }, { account, rateLimit, user }, { auth }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('@findsports_oficial/db/schema/auth'),
        import('./index')
      ])
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const password = 'Senha-de-teste-150!'
    const passwordHash = await (await auth.$context).password.hash(password)

    async function createUser() {
      const id = crypto.randomUUID()
      const email = `${id}@integration.invalid`
      await db.insert(user).values({
        id,
        name: 'Sessões WEB-150',
        email,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      })
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

    function request(path: string, cookie: string, body?: unknown) {
      return auth.handler(
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
    }

    async function signIn(email: string) {
      const response = await request('/sign-in/email', '', { email, password })
      expect(response.status).toBe(200)
      // Leva também o cookie cache, para o get-session passar pelo caminho
      // que lê a sessão do cookie e não do banco.
      return response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ')
    }

    async function call<T>(cookie: string, path: string, body?: unknown) {
      const response = await request(path, cookie, body)
      expect(response.status).toBe(200)
      return (await response.json()) as T
    }

    type Session = { id: string }
    const getSession = (cookie: string, query = '') =>
      call<{ session: Session } | null>(cookie, `/get-session${query}`)
    const listSessionIds = async (cookie: string) =>
      (await call<Session[]>(cookie, '/list-sessions')).map(({ id }) => id)

    const owner = await createUser()
    const stranger = await createUser()
    try {
      const cookieA = await signIn(owner.email)
      const cookieB = await signIn(owner.email)
      const cookieC = await signIn(stranger.email)

      for (const query of ['', '?disableCookieCache=true']) {
        const current = await getSession(cookieA, query)
        expect(current?.session.id).toBeString()
        expect(current?.session).not.toHaveProperty('token')
      }

      const sessions = await call<Session[]>(cookieA, '/list-sessions')
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
      await db.delete(user).where(eq(user.id, owner.id))
      await db.delete(user).where(eq(user.id, stranger.id))
      await db
        .delete(rateLimit)
        .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
    }
  }
)
