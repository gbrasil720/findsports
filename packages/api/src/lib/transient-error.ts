/*
 * Falha passageira × definitiva (WEB-460): a mesma regra no painel do bar
 * (web) e no app, que importam daqui. Puro: nada de servidor entra no bundle.
 *
 * - Passageira: sem rede, timeout, 5xx (Worker, Hyperdrive, Stripe ou
 *   geocoding fora do ar) e 429. A segunda tentativa pode dar certo.
 * - Definitiva: recusa da regra (`FORBIDDEN`, `PRECONDITION_FAILED`,
 *   validação, 404). Repetir só repete a recusa.
 */

type ErrorRecord = Record<string, unknown>

const TRANSIENT_CODES = new Set([
  'BAD_GATEWAY',
  'GATEWAY_TIMEOUT',
  'INTERNAL_SERVER_ERROR',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
  'TIMEOUT_ERROR',
  'TOO_MANY_REQUESTS',
  'FETCH_ERROR',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT'
])

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as ErrorRecord)
    : null
}

function getErrorValues(error: unknown): unknown[] {
  const record = asRecord(error)
  return [
    error,
    record?.error,
    record?.data,
    asRecord(record?.shape)?.data,
    asRecord(record?.cause)?.data
  ].filter(Boolean)
}

export function getErrorText(error: unknown): string {
  for (const value of getErrorValues(error)) {
    if (typeof value === 'string' && value) return value
    if (value instanceof Error && value.message) return value.message
    const record = asRecord(value)
    if (typeof record?.message === 'string') return record.message
    if (typeof record?.error === 'string') return record.error
  }
  return ''
}

export function getErrorCode(error: unknown): string | undefined {
  for (const value of getErrorValues(error)) {
    const record = asRecord(value)
    if (typeof record?.code === 'string') return record.code.toUpperCase()
  }
  return undefined
}

export function getErrorStatus(error: unknown): number | undefined {
  for (const value of getErrorValues(error)) {
    const record = asRecord(value)
    for (const key of ['status', 'statusCode', 'httpStatus']) {
      const status = record?.[key]
      if (typeof status === 'number') return status
    }
  }
  return undefined
}

export function isTransientError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status !== undefined)
    return status === 0 || status === 408 || status === 429 || status >= 500
  const code = getErrorCode(error)
  if (code && TRANSIENT_CODES.has(code)) return true
  // Sem status, sem código: a requisição nem chegou ("Failed to fetch" no
  // Chrome, "Load failed" no Safari, "Network request failed" no React
  // Native), ou a resposta não veio da API (a página de 502 da Cloudflare,
  // que o cliente do tRPC tenta ler como JSON).
  return /conexão|connection|econn|failed to fetch|fetch failed|load failed|network|offline|\brede\b|server error|temporar|timed out|timeout|not valid json|json parse|unexpected token|unrecognized token/i.test(
    getErrorText(error)
  )
}

/** Tentativas além da primeira, nas consultas e nas mutations seguras. */
export const MAX_RETRIES = 3

/** `retry` do React Query: só a falha passageira, até `MAX_RETRIES`. */
export function retryTransient(failures: number, error: unknown): boolean {
  return failures < MAX_RETRIES && isTransientError(error)
}

/** Espera crescente entre as tentativas: 1 s, 2 s, 4 s (teto de 8 s). */
export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000)
}
