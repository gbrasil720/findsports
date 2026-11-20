import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

// `stripeCustomerId` é do servidor (checkout, `startCardFromPix`): o plugin do
// Stripe o declara sem `input: false`, e o cliente prendia a própria conta a
// um cliente do Stripe qualquer, no cadastro e no `/update-user`.
integrationTest(
  'cadastro e /update-user recusam stripeCustomerId, papel admin e nome inválido',
  async () => {
    const [{ db, eq, sql }, { account, rateLimit, user }, { auth }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('@findsports_oficial/db/schema/auth'),
        import('./index')
      ])
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const password = 'Senha-de-teste-campos!'
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

    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    const signUpEmail = `cadastro-${id}@integration.invalid`
    await db.insert(user).values({
      id,
      name: 'Campos do cliente',
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
      password: await (await auth.$context).password.hash(password)
    })

    try {
      for (const extra of [
        { stripeCustomerId: 'cus_escolhido_pelo_cliente' },
        { role: 'admin' },
        // O nome vai no e-mail de confirmação: link não passa.
        { name: 'Ana https://golpe.example/entrar' }
      ]) {
        const signUp = await post('/sign-up/email', '', {
          name: 'Cadastro',
          email: signUpEmail,
          password,
          ...extra
        })
        expect(signUp.status).toBe(400)
      }
      expect(
        await db.select().from(user).where(eq(user.email, signUpEmail))
      ).toHaveLength(0)

      const signIn = await post('/sign-in/email', '', { email, password })
      expect(signIn.status).toBe(200)
      const cookie = signIn.headers
        .getSetCookie()
        .map((pair) => pair.split(';')[0])
        .join('; ')

      const update = await post('/update-user', cookie, {
        stripeCustomerId: 'cus_escolhido_pelo_cliente'
      })
      expect(update.status).toBe(400)
      const [row] = await db.select().from(user).where(eq(user.id, id))
      expect(row?.stripeCustomerId).toBeNull()

      for (const name of ['a'.repeat(81), 'Ana\nClique aqui', 'www.golpe.com'])
        expect((await post('/update-user', cookie, { name })).status).toBe(400)
      expect(
        (await post('/update-user', cookie, { name: '  Ana Souza  ' })).status
      ).toBe(200)
      const [renamed] = await db.select().from(user).where(eq(user.id, id))
      expect(renamed?.name).toBe('Ana Souza')
    } finally {
      await db.delete(user).where(eq(user.id, id))
      await db.delete(user).where(eq(user.email, signUpEmail))
      await db
        .delete(rateLimit)
        .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
    }
  }
)
