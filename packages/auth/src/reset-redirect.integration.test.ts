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

    // O esquema do app (build antigo) vira a página do site: não falha.
    expect((await request('onside://reset-password')).status).toBe(200)
    expect((await request('/reset-password')).status).toBe(200)
    const refusedBody = await request('https://evil.example/reset')
    expect(refusedBody.status).toBe(400)
    expect(((await refusedBody.json()) as { code?: string }).code).toBe(
      'RESET_REDIRECT_NOT_ALLOWED'
    )

    // O GET do link do e-mail (inclusive os mandados antes da regra) leva ao
    // site, nunca ao esquema do app.
    const callback = (target: string) =>
      auth.handler(
        new Request(
          `${baseUrl}/api/auth/reset-password/token-qualquer?callbackURL=${encodeURIComponent(target)}`,
          { headers: { 'x-forwarded-for': clientIp } }
        )
      )
    const app = await callback('onside://reset-password')
    expect(app.status).toBe(302)
    expect(app.headers.get('location')).toContain(
      '/reset-password?error=INVALID_TOKEN'
    )
    expect(app.headers.get('location')).not.toContain('onside:')
    expect((await callback('https://evil.example/x')).status).toBe(400)
    const web = await callback('/reset-password')
    expect(web.status).toBe(302)
    expect(web.headers.get('location')).toContain(
      '/reset-password?error=INVALID_TOKEN'
    )
  }
)
