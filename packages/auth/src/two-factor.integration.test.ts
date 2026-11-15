import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { symmetricDecrypt } from 'better-auth/crypto'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'ativar 2FA e entrar com código TOTP gravam o contador de falhas',
  async () => {
    const [{ db, eq, sql }, { account, rateLimit, twoFactor, user }, { auth }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('@findsports_oficial/db/schema/auth'),
        import('./index')
      ])
    const context = await auth.$context
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const password = 'Senha-de-teste-2fa!'

    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    await db.insert(user).values({
      id,
      name: '2FA',
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
      password: await context.password.hash(password)
    })

    // IP próprio por execução: o rate limit do sign-in é por IP e fica no banco.
    const octet = () => Math.floor(Math.random() * 256)
    const clientIp = `10.${octet()}.${octet()}.${octet()}`

    function post(path: string, cookie: string, body: unknown) {
      return auth.handler(
        new Request(`${baseUrl}/api/auth${path}`, {
          method: 'POST',
          headers: {
            cookie,
            origin: baseUrl,
            'content-type': 'application/json',
            'x-forwarded-for': clientIp
          },
          body: JSON.stringify(body)
        })
      )
    }

    const cookiesOf = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ')

    async function signIn() {
      const response = await post('/sign-in/email', '', { email, password })
      expect(response.status).toBe(200)
      return response
    }

    const row = async () => {
      const [found] = await db
        .select()
        .from(twoFactor)
        .where(eq(twoFactor.userId, id))
      if (!found) throw new Error('two_factor sem linha')
      return found
    }

    async function totp() {
      const secret = await symmetricDecrypt({
        key: context.secretConfig,
        data: (await row()).secret
      })
      return (await auth.api.generateTOTP({ body: { secret } })).code
    }

    async function sessionOf(cookie: string) {
      const response = await auth.handler(
        new Request(`${baseUrl}/api/auth/get-session`, {
          headers: { cookie, origin: baseUrl, 'x-forwarded-for': clientIp }
        })
      )
      return (await response.json()) as { user: { id: string } } | null
    }

    try {
      // Sessão aberta só com a senha antes do 2FA (aparelho perdido, senha
      // vazada): ligar o 2FA em outro lugar tem de derrubá-la, senão ela
      // herdava os portões de admin, que leem `user.twoFactorEnabled`.
      const before2fa = cookiesOf(await signIn())
      const session = cookiesOf(await signIn())
      expect(
        (await post('/two-factor/enable', session, { password })).status
      ).toBe(200)
      const enabled = await post('/two-factor/verify-totp', session, {
        code: await totp()
      })
      expect(enabled.status).toBe(200)
      expect((await row()).verified).toBe(true)
      // Só o token: o cookie cache (60 s) ainda guarda `twoFactorEnabled`
      // falso, que os portões recusam; vencido, a leitura vai ao banco.
      const tokenOnly = before2fa
        .split('; ')
        .filter((pair) => pair.startsWith('better-auth.session_token='))
        .join('; ')
      expect(await sessionOf(tokenOnly)).toBeNull()
      const enabler = cookiesOf(enabled)
      expect((await sessionOf(enabler))?.user.id).toBe(id)

      const pending = await signIn()
      expect(await pending.json()).toMatchObject({ twoFactorRedirect: true })
      const twoFactorCookie = cookiesOf(pending)

      const wrong = await post('/two-factor/verify-totp', twoFactorCookie, {
        code: '000000'
      })
      expect(wrong.status).toBe(401)
      expect((await row()).failedVerificationCount).toBe(1)

      const right = await post('/two-factor/verify-totp', twoFactorCookie, {
        code: await totp()
      })
      expect(right.status).toBe(200)
      // Entrar com TOTP não é ativar: os outros aparelhos ficam.
      expect((await sessionOf(enabler))?.user.id).toBe(id)
      expect(await row()).toMatchObject({
        failedVerificationCount: 0,
        lockedUntil: null
      })
    } finally {
      await db.delete(user).where(eq(user.id, id))
      await db
        .delete(rateLimit)
        .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
    }
  }
)
