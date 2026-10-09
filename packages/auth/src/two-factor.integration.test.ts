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

    try {
      const session = cookiesOf(await signIn())
      expect(
        (await post('/two-factor/enable', session, { password })).status
      ).toBe(200)
      expect(
        (await post('/two-factor/verify-totp', session, { code: await totp() }))
          .status
      ).toBe(200)
      expect((await row()).verified).toBe(true)

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
