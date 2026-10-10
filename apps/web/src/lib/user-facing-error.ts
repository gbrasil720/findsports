export type UserFacingErrorContext = 'credentials'

export type UserFacingError = {
  message: string
  retryable: boolean
}

type ErrorRecord = Record<string, unknown>

const RETRYABLE_CODES = new Set([
  'BAD_GATEWAY',
  'GATEWAY_TIMEOUT',
  'INTERNAL_SERVER_ERROR',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
  'TIMEOUT_ERROR',
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

function getErrorText(error: unknown): string {
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

function getErrorStatus(error: unknown): number | undefined {
  for (const value of getErrorValues(error)) {
    const record = asRecord(value)
    for (const key of ['status', 'statusCode', 'httpStatus']) {
      const status = record?.[key]
      if (typeof status === 'number') return status
    }
  }
  return undefined
}

/**
 * Recusa da nossa API (tRPC), que já vem escrita para quem usa: "Seu plano
 * Elite está parado…", "Confirme seu e-mail para continuar.". O better-auth
 * também responde 403, mas em inglês e sem `data.httpStatus`.
 */
function isOwnApiRefusal(error: unknown): boolean {
  return (
    typeof asRecord(asRecord(error)?.data)?.httpStatus === 'number' ||
    typeof asRecord(asRecord(asRecord(error)?.shape)?.data)?.httpStatus ===
      'number'
  )
}

export function isRetryableError(error: unknown): boolean {
  const code = getErrorCode(error)
  const status = getErrorStatus(error)
  const text = getErrorText(error)

  if (status !== undefined)
    return status === 0 || status === 408 || status >= 500
  if (code && RETRYABLE_CODES.has(code)) return true

  return /conexão|connection|econn|failed to fetch|fetch failed|network|offline|\brede\b|server error|temporar|timed out|timeout/i.test(
    text
  )
}

/**
 * `retry` padrão das queries: recusa da API (bar que não existe, sem
 * permissão) não muda na segunda tentativa, e insistir três vezes segurava o
 * esqueleto por uns 7 s antes de a tela dizer o que houve.
 */
export function shouldRetryQuery(failures: number, error: unknown): boolean {
  return failures < 3 && isRetryableError(error)
}

export function getUserFacingError(
  error: unknown,
  fallback: string,
  context?: UserFacingErrorContext
): UserFacingError {
  const code = getErrorCode(error)
  const status = getErrorStatus(error)
  const text = getErrorText(error)
  const normalizedText = text.toLowerCase()

  if (
    code === 'INVALID_CREDENTIALS' ||
    code === 'INVALID_EMAIL_OR_PASSWORD' ||
    code === 'INVALID_PASSWORD' ||
    (context === 'credentials' && status === 401) ||
    /invalid (email|password|credential)|incorrect (email|password)|credenciais inválidas|senha atual/i.test(
      normalizedText
    )
  ) {
    return {
      message: 'Credenciais inválidas. Verifique e tente novamente.',
      retryable: false
    }
  }

  if (
    code === 'INVALID_TOKEN' ||
    code === 'TOKEN_EXPIRED' ||
    /invalid[_ -]token|expired[_ -]token|token.*(invalid|expired)|(?:convite|link).*(inválid|expir|não é válido)/i.test(
      normalizedText
    )
  ) {
    return {
      message: 'Este link não é válido ou já expirou.',
      retryable: false
    }
  }

  // Turnstile: o plugin `captcha` do better-auth responde MISSING_RESPONSE
  // (400) ou VERIFICATION_FAILED (403), em inglês; a waitlist (tRPC) manda
  // "captcha" na mensagem. Antes do 403 genérico, que falaria em permissão.
  if (
    code === 'MISSING_RESPONSE' ||
    code === 'VERIFICATION_FAILED' ||
    /captcha/i.test(normalizedText)
  ) {
    return {
      message:
        'Não conseguimos confirmar a verificação de segurança. Conclua a verificação, se ela aparecer, e tente de novo.',
      retryable: false
    }
  }

  if (
    status === 429 ||
    code === 'TOO_MANY_REQUESTS' ||
    /too many requests|rate limit|muitas tentativas/i.test(normalizedText)
  ) {
    return {
      message:
        'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.',
      retryable: false
    }
  }

  if (status === 401 || code === 'UNAUTHORIZED') {
    return {
      message: 'Sua sessão expirou. Entre novamente para continuar.',
      retryable: false
    }
  }

  if (status === 403 || code === 'FORBIDDEN') {
    // A recusa da nossa API diz o motivo e o que fazer; trocá-la por "sem
    // permissão" deixava o dono do bar sem saber que bateu o limite de jogos.
    return {
      message:
        text && isOwnApiRefusal(error)
          ? text
          : 'Você não tem permissão para realizar esta ação.',
      retryable: false
    }
  }

  if (status === 404 || code === 'NOT_FOUND') {
    return {
      message: 'O conteúdo solicitado não está disponível.',
      retryable: false
    }
  }

  return { message: fallback, retryable: isRetryableError(error) }
}

export function getUserFacingMessage(
  error: unknown,
  fallback: string,
  context?: UserFacingErrorContext
): string {
  return getUserFacingError(error, fallback, context).message
}
