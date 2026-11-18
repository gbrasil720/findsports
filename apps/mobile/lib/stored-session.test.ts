import { expect, test } from 'bun:test'
import { sessionToKeep } from './stored-session'

// Vencida há dias: o plugin do Expo não a usa na partida.
const stored = JSON.stringify({
  user: { id: 'u1', name: 'Ana' },
  session: { id: 's1', expiresAt: '2026-11-01T00:00:00.000Z' }
})
const failed = (error: unknown) => ({ data: null, error, isPending: false })

test('sem rede, timeout ou 5xx: fica com a guardada', () => {
  for (const error of [
    new TypeError('Network request failed'),
    new Error('The request timed out.'),
    { status: 502, statusText: 'Bad Gateway' },
    { status: 503, statusText: 'Service Unavailable' },
    { status: 0, statusText: '' }
  ])
    expect(sessionToKeep(failed(error), stored)?.user.id).toBe('u1')
})

test('o servidor respondeu: 401 ou 200 sem sessão tiram da conta', () => {
  expect(
    sessionToKeep(failed({ status: 401, statusText: 'Unauthorized' }), stored)
  ).toBeNull()
  expect(
    sessionToKeep({ data: null, error: null, isPending: false }, stored)
  ).toBeNull()
})

test('recusa que não é passageira não ressuscita a sessão', () => {
  expect(
    sessionToKeep(failed({ status: 403, statusText: 'Forbidden' }), stored)
  ).toBeNull()
})

test('nada guardado, guardado vazio ou estragado: segue visitante', () => {
  const offline = failed(new TypeError('Network request failed'))
  expect(sessionToKeep(offline, null)).toBeNull()
  expect(sessionToKeep(offline, '{}')).toBeNull()
  expect(sessionToKeep(offline, 'null')).toBeNull()
  expect(sessionToKeep(offline, '{quebrado')).toBeNull()
})

test('lendo, ou já com sessão, não mexe', () => {
  const offline = new TypeError('Network request failed')
  expect(
    sessionToKeep({ data: null, error: offline, isPending: true }, stored)
  ).toBeNull()
  expect(
    sessionToKeep(
      { data: { user: {} }, error: offline, isPending: false },
      stored
    )
  ).toBeNull()
})
