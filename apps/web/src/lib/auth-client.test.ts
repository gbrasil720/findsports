import { expect, mock, test } from 'bun:test'

const expireSessionCache = mock(() =>
  Promise.reject(new TypeError('Failed to fetch'))
)
mock.module('better-auth/react', () => ({
  createAuthClient: () => ({ expireSessionCache })
}))

// A query força uma instância nova do módulo: se outro arquivo de teste já
// carregou `auth-client`, o client dele foi criado sem o mock acima.
const fresh = './auth-client?mocked'
const { refreshSessionCache }: typeof import('./auth-client') = await import(
  fresh
)

test('refreshSessionCache resolves when the session request fails', async () => {
  // Roda depois de o cadastro já estar gravado (/verify-email, onboarding):
  // uma falha de rede aqui não pode virar o erro genérico da página.
  await expect(refreshSessionCache()).resolves.toBeUndefined()
  expect(expireSessionCache).toHaveBeenCalledTimes(1)
})
