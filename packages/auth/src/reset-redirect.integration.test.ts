import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'o link de redefinição de senha não leva o token a onside://',
  async () => {
    const { auth } = await import('./index')
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const octet = () => Math.floor(Math.random() * 256)
    const clientIp = `10.${octet()}.${octet()}.${octet()}`
    const headers = {
      origin: baseUrl,
      'content-type': 'application/json',
      'x-forwarded-for': clientIp
    }
    // E-mail que não existe: o better-auth responde igual e não manda nada.
    const email = `${crypto.randomUUID()}@integration.invalid`
    const request = (redirectTo: string) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/request-password-reset`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, redirectTo })
        })
      )

    expect((await request('onside://reset-password')).status).toBe(400)
    expect((await request('onside://x?y=1')).status).toBe(400)
    expect((await request('/reset-password')).status).toBe(200)

    // O GET do link do e-mail também recusa o esquema no callbackURL.
    const callback = (target: string) =>
      auth.handler(
        new Request(
          `${baseUrl}/api/auth/reset-password/token-qualquer?callbackURL=${encodeURIComponent(target)}`,
          { headers: { 'x-forwarded-for': clientIp } }
        )
      )
    const refused = await callback('onside://reset-password')
    expect(refused.status).toBe(400)
    expect(refused.headers.get('location')).toBeNull()
    const web = await callback('/reset-password')
    expect(web.status).toBe(302)
    expect(web.headers.get('location')).toContain(
      '/reset-password?error=INVALID_TOKEN'
    )
  }
)
