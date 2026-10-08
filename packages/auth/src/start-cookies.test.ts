import { expect, test } from 'bun:test'
import { requestHandler } from '@tanstack/react-start/server'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { startCookies } from './start-cookies'

// WEB-247: login por `auth.api` dentro de uma requisição do Start tem de sair
// com o cookie da sessão na resposta, mesmo quando a rota devolve a própria
// `Response`.
test('auth.api grava o cookie de sessão na resposta do Start', async () => {
  const baseURL = 'http://localhost:3001'
  const auth = betterAuth({
    baseURL,
    secret: 'start-cookies-test-secret-00000000000000000',
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: []
    }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [startCookies()]
  })
  const body = { email: 'pessoa@cookies.invalid', password: 'senha-de-teste-1' }
  await auth.api.signUpEmail({ body: { ...body, name: 'Pessoa' } })

  const handle = requestHandler(async () => {
    await auth.api.signInEmail({ body })
    return Response.json({ ok: true })
  })
  const response = await handle(new Request(`${baseURL}/qualquer`), {})

  expect(
    response.headers.getSetCookie().some((c) => c.includes('session_token='))
  ).toBe(true)
})
