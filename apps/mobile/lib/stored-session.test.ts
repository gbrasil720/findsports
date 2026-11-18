import { expect, test } from 'bun:test'
import { isTransientError } from '@findsports_oficial/api/lib/transient-error'
import { retryable, settleAuth } from './auth-attempt'
import {
  accountWithoutData,
  authFetch,
  isSessionBody,
  sessionStep,
  sessionToKeep
} from './stored-session'

// Vencida há dias: o plugin do Expo não a usa na partida. O formato é o do
// `/get-session` do better-auth (sem `token`).
const stored = JSON.stringify({
  user: { id: 'u1', name: 'Ana' },
  session: { id: 's1', userId: 'u1', expiresAt: '2026-11-01T00:00:00.000Z' }
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

const NOW = Date.parse('2026-11-18T12:00:00.000Z')
const cookie = (expires: string | null, name = 'better-auth.session_token') =>
  JSON.stringify({ [name]: { value: 'tok.sig', expires } })
const offline = failed(new TypeError('Network request failed'))

test('cookie válido e falha passageira: conta sem dados, não visitante', () => {
  const valid = cookie('2026-11-25T00:00:00.000Z')
  for (const error of [
    new TypeError('Network request failed'),
    { status: 502, statusText: 'Bad Gateway' },
    { status: 0, statusText: '' }
  ])
    expect(accountWithoutData(failed(error), valid, false, NOW)).toBe(true)
  // Em https o cookie leva o prefixo `__Secure-`; sem `expires`, de sessão.
  expect(
    accountWithoutData(
      offline,
      cookie(null, '__Secure-better-auth.session_token'),
      false,
      NOW
    )
  ).toBe(true)
})

test('o servidor respondeu: 401, 200 sem sessão ou recusa tiram da conta', () => {
  const valid = cookie('2026-11-25T00:00:00.000Z')
  const no401 = failed({ status: 401, statusText: 'Unauthorized' })
  expect(accountWithoutData(no401, valid, true, NOW)).toBe(false)
  const empty = { data: null, error: null, isPending: false }
  expect(accountWithoutData(empty, valid, true, NOW)).toBe(false)
  const no403 = failed({ status: 403, statusText: 'Forbidden' })
  expect(accountWithoutData(no403, valid, false, NOW)).toBe(false)
})

test('sem cookie de sessão válido segue visitante', () => {
  for (const raw of [
    null,
    '{}',
    'null',
    '{quebrado',
    cookie('2026-11-17T00:00:00.000Z'),
    cookie('2026-11-25T00:00:00.000Z', 'better-auth.dont_remember'),
    JSON.stringify({ 'better-auth.session_token': { value: '' } })
  ])
    expect(accountWithoutData(offline, raw, false, NOW)).toBe(false)
})

test('relendo, mantém a resposta anterior; com sessão, não é o caso', () => {
  const valid = cookie(null)
  const reading = { data: null, error: null, isPending: true }
  expect(accountWithoutData(reading, valid, true, NOW)).toBe(true)
  expect(accountWithoutData(reading, valid, false, NOW)).toBe(false)
  const withData = {
    data: { user: {} },
    error: offline.error,
    isPending: false
  }
  expect(accountWithoutData(withData, valid, true, NOW)).toBe(false)
})

const reply = (body: string, init?: ResponseInit) => async () =>
  new Response(body, init)
// Aceita a conexão e não responde: só para quando cancelam.
const silent = (_: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError'))
    )
  )
const call = (
  impl: Parameters<typeof authFetch>[0],
  path: string,
  ms = 1000,
  init?: RequestInit
) =>
  authFetch(impl, { session: ms, other: ms })(
    `http://api/api/auth${path}`,
    init
  )
const get = (impl: Parameters<typeof authFetch>[0], ms?: number) =>
  call(impl, '/get-session', ms)

test('portal de Wi-Fi: 200 com HTML na sessão é falha passageira', async () => {
  const error = await get(
    reply('<html>Entre no Wi-Fi</html>', {
      headers: { 'content-type': 'text/html' }
    })
  ).catch((e) => e)
  expect(error).toBeInstanceOf(TypeError)
  expect(isTransientError(error)).toBe(true)
  expect(sessionToKeep(failed(error), stored)?.user.id).toBe('u1')
})

test('só passa null, vazio ou a sessão inteira do better-auth', async () => {
  expect(isSessionBody('null')).toBe(true)
  expect(isSessionBody('')).toBe(true)
  expect(isSessionBody(stored)).toBe(true)
  const session = { id: 's1', userId: 'u1', expiresAt: '2026-11-25T00:00:00Z' }
  for (const body of [
    { ok: true },
    'texto',
    [],
    { session: {}, foo: 1 },
    { session: null, user: null },
    { session, user: null },
    { session, user: [] },
    { session, user: { id: '' } },
    { session, user: { id: 7 } },
    { session: { ...session, id: undefined }, user: { id: 'u1' } },
    { session: { ...session, userId: 'u2' }, user: { id: 'u1' } },
    { session: { ...session, expiresAt: undefined }, user: { id: 'u1' } },
    { session: { ...session, expiresAt: 'amanhã' }, user: { id: 'u1' } }
  ])
    expect(isSessionBody(JSON.stringify(body))).toBe(false)
  const response = await get(reply('null'))
  expect(await response.text()).toBe('null')
})

test('corpo fora do formato vira falha passageira e mantém a guardada', async () => {
  const error = await get(reply('{"session":{},"foo":1}')).catch((e) => e)
  expect(error).toBeInstanceOf(TypeError)
  expect(isTransientError(error)).toBe(true)
  expect(sessionToKeep(failed(error), stored)?.user.id).toBe('u1')
})

test('erro do servidor segue como resposta (401 tira da conta)', async () => {
  const response = await get(reply('{}', { status: 401 }))
  expect(response.status).toBe(401)
})

test('servidor que não responde: estoura no teto como falha passageira', async () => {
  const error = await get(silent, 20).catch((e) => e)
  expect(isTransientError(error)).toBe(true)
  expect(sessionToKeep(failed(error), stored)?.user.id).toBe('u1')
})

test('cancelada por quem chamou não vira timeout, em toda rota', async () => {
  for (const path of ['/get-session', '/sign-in/email']) {
    const outer = new AbortController()
    const pending = call(silent, path, 1000, { signal: outer.signal }).catch(
      (e) => e
    )
    outer.abort()
    expect((await pending).name).toBe('AbortError')
  }
})

test('login, cadastro e o resto também têm teto, sem repetir', async () => {
  for (const path of [
    '/sign-in/email',
    '/sign-up/email',
    '/send-verification-email',
    '/request-password-reset',
    '/two-factor/verify-totp',
    '/app-session/redeem'
  ]) {
    let calls = 0
    const counted = (input: unknown, init?: RequestInit) => {
      calls++
      return silent(input, init)
    }
    const error = await call(counted, path, 20, { method: 'POST' }).catch(
      (e) => e
    )
    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe('Network request timed out')
    expect(isTransientError(error)).toBe(true)
    expect(calls).toBe(1)
  }
})

test('as outras rotas usam o teto delas, não o da sessão', async () => {
  const slow = (ms: number) => async () => {
    await new Promise((r) => setTimeout(r, ms))
    return new Response('{"ok":true}')
  }
  const fetchWith = authFetch(slow(40), { session: 10, other: 200 })
  const ok = await fetchWith('http://api/api/auth/sign-in/email')
  expect(await ok.json()).toEqual({ ok: true })
  const late = await fetchWith('http://api/api/auth/get-session').catch(
    (e) => e
  )
  expect(late.message).toBe('Network request timed out')
})

test('outras rotas: JSON passa, portal com HTML vira falha passageira', async () => {
  const json = await call(reply('{"redirect":false}'), '/sign-in/email')
  expect(await json.json()).toEqual({ redirect: false })
  const empty = await call(reply(''), '/sign-out')
  expect(await empty.text()).toBe('')
  const error = await call(reply('<html/>'), '/sign-in/email').catch((e) => e)
  expect(error).toBeInstanceOf(TypeError)
  expect(isTransientError(error)).toBe(true)
  // Erro do servidor (a página de 502 da borda) segue como resposta.
  const bad = await call(reply('<html/>', { status: 502 }), '/sign-in/email')
  expect(bad.status).toBe(502)
})

test('na tela de conta, o teto vira a falha de sem conexão e "Tentar de novo"', async () => {
  const result = await settleAuth(call(silent, '/sign-in/email', 20))
  expect('error' in result && result.error.status).toBe(0)
  expect(retryable('error' in result ? result.error : null)).toBe(true)
})
