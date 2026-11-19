import { expect, test } from 'bun:test'
import { sessionStep, sessionToKeep } from './stored-session'

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

test('passo: falha passageira põe a guardada no lugar', () => {
  const step = sessionStep(
    failed(new TypeError('Network request failed')),
    stored,
    null
  )
  expect(step.set?.user.id).toBe('u1')
  expect(step.restored).toBe(step.set ?? null)
  expect(step.clearCache).toBe(false)
})

test('passo: 401 apaga o cache e não ressuscita', () => {
  const step = sessionStep(
    failed({ status: 401, statusText: 'Unauthorized' }),
    stored,
    null
  )
  expect(step).toEqual({ restored: null, clearCache: true })
})

test('passo: 403 depois de restaurar tira a restaurada', () => {
  const restored = sessionToKeep(
    failed({ status: 502, statusText: '' }),
    stored
  )
  const step = sessionStep(
    {
      data: restored,
      error: { status: 403, statusText: 'Forbidden' },
      isPending: false
    },
    stored,
    restored
  )
  expect(step.set).toBeNull()
  expect(step.restored).toBeNull()
})

test('passo: outra queda mantém a restaurada; sessão do servidor zera', () => {
  const restored = sessionToKeep(
    failed({ status: 502, statusText: '' }),
    stored
  )
  const again = sessionStep(
    {
      data: restored,
      error: { status: 503, statusText: '' },
      isPending: false
    },
    stored,
    restored
  )
  expect(again.set).toBeUndefined()
  expect(again.restored).toBe(restored)
  const fresh = { user: { id: 'u1' }, session: { id: 's2' } }
  expect(
    sessionStep(
      { data: fresh, error: null, isPending: false },
      stored,
      restored
    ).restored
  ).toBeNull()
})
