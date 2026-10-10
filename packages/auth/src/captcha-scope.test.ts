import { expect, test } from 'bun:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { captcha } from 'better-auth/plugins'

// O plugin `captcha` age no `onRequest` do roteador HTTP, e não nos hooks que
// `auth.api` também roda: chamada do servidor por `auth.api` entra sem token
// do Turnstile. Se uma versão do better-auth mudar isso, este teste quebra
// antes.
test('captcha barra o login HTTP sem token, mas não a chamada por auth.api', async () => {
  const baseURL = 'http://localhost:3001'
  const auth = betterAuth({
    baseURL,
    secret: 'captcha-scope-test-secret-0000000000000000',
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: []
    }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: 'never-sent',
        endpoints: ['/sign-in/email']
      })
    ]
  })
  const body = {
    email: 'pessoa@captcha.invalid',
    password: 'senha-de-teste-123'
  }
  await auth.api.signUpEmail({ body: { ...body, name: 'Pessoa' } })

  const http = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL },
      body: JSON.stringify(body)
    })
  )
  expect(http.status).toBe(400)
  expect(((await http.json()) as { code: string }).code).toBe(
    'MISSING_RESPONSE'
  )

  const server = await auth.api.signInEmail({ body, asResponse: true })
  expect(server.status).toBe(200)
  expect(server.headers.getSetCookie().length).toBeGreaterThan(0)
})
