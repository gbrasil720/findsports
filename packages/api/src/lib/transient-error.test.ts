import { expect, test } from 'bun:test'
import { TRPCClientError } from '@trpc/client'
import {
  actionPhase,
  IDEMPOTENT_MUTATIONS,
  isTransientError,
  retryDelay,
  retryTransient
} from './transient-error'

/** O erro como o cliente do tRPC entrega a recusa do servidor. */
const trpcError = (code: string, httpStatus: number) =>
  TRPCClientError.from({
    error: {
      message: 'recusa',
      code: -32000,
      data: { code, httpStatus }
    }
  })

test('passageira: sem rede, em cada motor', () => {
  for (const message of [
    'Failed to fetch',
    'Load failed',
    'Network request failed',
    'fetch failed'
  ])
    expect(isTransientError(TRPCClientError.from(new TypeError(message)))).toBe(
      true
    )
})

test('passageira: página de gateway que não é JSON', () => {
  expect(
    isTransientError(
      TRPCClientError.from(
        new SyntaxError(
          `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
        )
      )
    )
  ).toBe(true)
  expect(
    isTransientError(
      TRPCClientError.from(
        new SyntaxError("JSON Parse error: Unrecognized token '<'")
      )
    )
  ).toBe(true)
})

test('passageira: timeout, 5xx e 429', () => {
  expect(isTransientError(trpcError('TIMEOUT', 408))).toBe(true)
  expect(isTransientError(trpcError('INTERNAL_SERVER_ERROR', 500))).toBe(true)
  expect(isTransientError(trpcError('BAD_GATEWAY', 502))).toBe(true)
  expect(isTransientError(trpcError('SERVICE_UNAVAILABLE', 503))).toBe(true)
  expect(isTransientError(trpcError('GATEWAY_TIMEOUT', 504))).toBe(true)
  expect(isTransientError(trpcError('TOO_MANY_REQUESTS', 429))).toBe(true)
  expect(isTransientError({ status: 0 })).toBe(true)
})

test('definitiva: recusa da regra não repete', () => {
  expect(isTransientError(trpcError('FORBIDDEN', 403))).toBe(false)
  expect(isTransientError(trpcError('PRECONDITION_FAILED', 412))).toBe(false)
  expect(isTransientError(trpcError('BAD_REQUEST', 400))).toBe(false)
  expect(isTransientError(trpcError('UNAUTHORIZED', 401))).toBe(false)
  expect(isTransientError(trpcError('NOT_FOUND', 404))).toBe(false)
  expect(isTransientError(trpcError('CONFLICT', 409))).toBe(false)
  expect(isTransientError(new Error('credenciais inválidas'))).toBe(false)
})

test('nova tentativa: só a passageira, até três, com espera crescente', () => {
  const rede = new TypeError('Failed to fetch')
  expect(retryTransient(0, rede)).toBe(true)
  expect(retryTransient(2, rede)).toBe(true)
  expect(retryTransient(3, rede)).toBe(false)
  expect(retryTransient(0, trpcError('FORBIDDEN', 403))).toBe(false)
  expect([0, 1, 2, 3, 4].map(retryDelay)).toEqual([
    1000, 2000, 4000, 8000, 8000
  ])
})

test('a lista de mutations seguras só tem mutation que existe', async () => {
  const { appRouter } = await import('../routers/index')
  const procedures = appRouter._def.procedures as unknown as Record<
    string,
    { _def: { type: string } }
  >
  for (const path of IDEMPOTENT_MUTATIONS)
    expect([path, procedures[path]?._def.type]).toEqual([path, 'mutation'])
})

test('o botão conta o que acontece com a ação', () => {
  const m = (state: Partial<Parameters<typeof actionPhase>[0][number]>) => ({
    isPending: false,
    isPaused: false,
    isError: false,
    failureCount: 0,
    error: null,
    ...state
  })
  expect(actionPhase([m({})])).toBe('idle')
  expect(actionPhase([m({ isPending: true })])).toBe('sending')
  expect(actionPhase([m({ isPending: true, isPaused: true })])).toBe('waiting')
  expect(actionPhase([m({ isPending: true, failureCount: 1 })])).toBe(
    'retrying'
  )
  expect(
    actionPhase([m({ isError: true, error: new TypeError('Failed to fetch') })])
  ).toBe('failed')
  // Recusa do servidor: o botão volta ao normal, a mensagem explica.
  expect(
    actionPhase([m({ isError: true, error: trpcError('FORBIDDEN', 403) })])
  ).toBe('idle')
  expect(actionPhase([m({})], { busy: true })).toBe('sending')
  expect(actionPhase([m({})], { done: true })).toBe('done')
  expect(actionPhase([m({})], { failed: true })).toBe('failed')
})
