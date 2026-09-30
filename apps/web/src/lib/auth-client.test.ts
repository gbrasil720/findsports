import { expect, mock, test } from 'bun:test'

const getSession = mock(() => Promise.reject(new TypeError('Failed to fetch')))
mock.module('better-auth/react', () => ({
  createAuthClient: () => ({ getSession })
}))

const { refreshSessionCache } = await import('./auth-client')

test('refreshSessionCache resolves when the session request fails', async () => {
  // Roda depois de o cadastro já estar gravado (/verify-email, onboarding):
  // uma falha de rede aqui não pode virar o erro genérico da página.
  await expect(refreshSessionCache()).resolves.toBeUndefined()
  expect(getSession).toHaveBeenCalledTimes(1)
})
