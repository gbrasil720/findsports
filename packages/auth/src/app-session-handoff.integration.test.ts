import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { createEmailVerificationToken } from 'better-auth/api'
import { sha256Hex } from './app-session-handoff'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'a confirmação de e-mail entrega ao app um código de uso único, não a sessão',
  async () => {
    const [{ db }, { user }, { auth }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('./index')
    ])
    const context = await auth.$context
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const octet = () => Math.floor(Math.random() * 256)
    const clientIp = `10.${octet()}.${octet()}.${octet()}`

    async function newUser() {
      const id = crypto.randomUUID()
      const email = `${id}@integration.invalid`
      await db.insert(user).values({
        id,
        name: 'Handoff',
        email,
        emailVerified: false,
        role: 'fan'
      })
      return { id, email }
    }

    /** O GET do link do e-mail; devolve o `Location`. */
    async function verify(email: string, callbackURL: string) {
      const token = await createEmailVerificationToken(context.secret, email)
      const response = await auth.handler(
        new Request(
          `${baseUrl}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
          { headers: { 'x-forwarded-for': clientIp } }
        )
      )
      expect(response.status).toBe(302)
      return new URL(response.headers.get('location') ?? '', baseUrl)
    }

    function redeem(code: string, verifier: string) {
      return auth.handler(
        new Request(`${baseUrl}/api/auth/app-session/redeem`, {
          method: 'POST',
          headers: {
            origin: baseUrl,
            'content-type': 'application/json',
            'x-forwarded-for': clientIp
          },
          body: JSON.stringify({ code, verifier })
        })
      )
    }

    const verifier = 'v'.repeat(20) + crypto.randomUUID()
    const challenge = await sha256Hex(verifier)

    // Caminho certo: código na URL, sem sessão; o verificador a resgata uma vez.
    const a = await newUser()
    const back = await verify(a.email, `onside://verified?c=${challenge}`)
    expect(back.protocol).toBe('onside:')
    expect(back.searchParams.get('cookie')).toBeNull()
    expect(back.searchParams.get('c')).toBe(challenge)
    const code = back.searchParams.get('code') ?? ''
    expect(code.length).toBeGreaterThan(20)

    const ok = await redeem(code, verifier)
    expect(ok.status).toBe(200)
    const { cookie } = (await ok.json()) as { cookie: string }
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie.split(';')[0] ?? '' })
    })
    expect(session?.user.id).toBe(a.id)

    // Reusado: recusa.
    expect((await redeem(code, verifier)).status).toBe(400)

    // Verificador errado: recusa e gasta o código (o certo também não serve).
    const b = await newUser()
    const backB = await verify(b.email, `onside://verified?c=${challenge}`)
    const codeB = backB.searchParams.get('code') ?? ''
    expect((await redeem(codeB, `${verifier}-outro`)).status).toBe(400)
    expect((await redeem(codeB, verifier)).status).toBe(400)

    // Vencido: recusa.
    const late = 'codigo-vencido-de-teste-1234567890'
    await context.internalAdapter.createVerificationValue({
      identifier: `app-session:${late}`,
      value: JSON.stringify({ challenge, cookie: 'x=y' }),
      expiresAt: new Date(Date.now() - 1000)
    })
    expect((await redeem(late, verifier)).status).toBe(400)

    // App antigo, sem `c`: a sessão não vai na URL, nem código.
    const c = await newUser()
    const old = await verify(c.email, 'onside://verified')
    expect(old.searchParams.get('cookie')).toBeNull()
    expect(old.searchParams.get('code')).toBeNull()

    // O site (https/http) segue como antes: cookie no navegador, nada na URL.
    const d = await newUser()
    const web = await verify(d.email, '/dashboard')
    expect(web.searchParams.get('code')).toBeNull()
  }
)
