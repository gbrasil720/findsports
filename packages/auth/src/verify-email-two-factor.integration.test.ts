import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

// O link de confirmação entra na conta (`autoSignInAfterVerification`) sem
// passar pelo TOTP. Com o 2FA ligado, ele só confirma o e-mail: a sessão
// sai do login, que pede o segundo fator. Sem 2FA nada muda, inclusive a
// volta ao app com a sessão na URL (`onside://verified?cookie=…`).
integrationTest('link de confirmação só entra na conta sem 2FA', async () => {
  const [
    { db, eq },
    { session, user },
    { auth },
    { createEmailVerificationToken }
  ] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/schema/auth'),
    import('./index'),
    import('better-auth/api')
  ])
  const context = await auth.$context
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
  const ids: string[] = []

  async function createUser(twoFactorEnabled: boolean) {
    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    await db.insert(user).values({
      id,
      name: 'Link de confirmação',
      email,
      emailVerified: false,
      twoFactorEnabled,
      role: 'fan'
    })
    ids.push(id)
    return { id, email }
  }

  async function openLink(email: string, callbackURL: string) {
    const token = await createEmailVerificationToken(context.secret, email)
    const url = new URL(`${baseUrl}/api/auth/verify-email`)
    url.searchParams.set('token', token)
    url.searchParams.set('callbackURL', callbackURL)
    return auth.handler(new Request(url.toString()))
  }

  const sessionCookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .filter((cookie) => /session_(token|data)=[^;]/.test(cookie))

  const state = async (id: string) => {
    const [row] = await db.select().from(user).where(eq(user.id, id))
    const sessions = await db
      .select()
      .from(session)
      .where(eq(session.userId, id))
    return { verified: row?.emailVerified, sessions: sessions.length }
  }

  try {
    for (const callbackURL of ['onside://verified', `${baseUrl}/dashboard`]) {
      const plain = await createUser(false)
      const opened = await openLink(plain.email, callbackURL)
      expect(opened.status).toBe(302)
      expect(await state(plain.id)).toEqual({ verified: true, sessions: 1 })
      if (callbackURL.startsWith('onside:')) {
        expect(opened.headers.get('location')).toContain('cookie=')
      } else {
        expect(sessionCookies(opened).length).toBeGreaterThan(0)
      }

      const guarded = await createUser(true)
      const refused = await openLink(guarded.email, callbackURL)
      expect(refused.status).toBe(302)
      const location = refused.headers.get('location') ?? ''
      expect(location.startsWith(callbackURL)).toBe(true)
      expect(location).not.toContain('cookie=')
      expect(sessionCookies(refused)).toEqual([])
      expect(await state(guarded.id)).toEqual({ verified: true, sessions: 0 })
    }
  } finally {
    for (const id of ids) await db.delete(user).where(eq(user.id, id))
  }
})
