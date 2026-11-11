import {
  getErrorCode,
  getErrorStatus,
  getErrorText,
  isTransientError,
  retryTransient
} from '@findsports_oficial/api/lib/transient-error'

export type UserFacingErrorContext = 'credentials'

export type UserFacingError = {
  message: string
  retryable: boolean
}

export { getErrorCode }

type ErrorRecord = Record<string, unknown>

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as ErrorRecord)
    : null
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

/**
 * Recusa de regra da nossa API (400, 409, 412) diz o que corrigir: "CNPJ
 * inválido. Confira os números.", "A galeria mudou. Recarregue…". A entrada
 * recusada pelo zod também é 400, mas a mensagem é o JSON das issues (em
 * inglês), e essa fica com o texto da tela (WEB-474).
 */
const RULE_REFUSAL_STATUSES = new Set([400, 409, 412])

function isRuleRefusal(
  error: unknown,
  status: number | undefined,
  text: string
) {
  return (
    status !== undefined &&
    RULE_REFUSAL_STATUSES.has(status) &&
    !/^\s*[[{]/.test(text) &&
    isOwnApiRefusal(error)
  )
}

/**
 * Falha passageira (sem rede, timeout, 5xx, 429): a regra comum de web e app
 * (WEB-460), em `@findsports_oficial/api/lib/transient-error`.
 */
export const isRetryableError = isTransientError

/**
 * `retry` padrão das queries: recusa da API (bar que não existe, sem
 * permissão) não muda na segunda tentativa, e insistir três vezes segurava o
 * esqueleto por uns 7 s antes de a tela dizer o que houve.
 */
export const shouldRetryQuery = retryTransient

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
    /invalid[_ -]token|expired[_ -]token|token.*(invalid|expired)|link.*(inválid|expir|não é válido)/i.test(
      normalizedText
    )
  ) {
    return {
      message: 'Este link não é válido ou já expirou.',
      retryable: false
    }
  }

  // Turnstile: o plugin `captcha` do better-auth responde MISSING_RESPONSE
  // (400) ou VERIFICATION_FAILED (403), em inglês. Antes do 403 genérico, que
  // falaria em permissão.
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

  if (text && isRuleRefusal(error, status, text)) {
    return { message: text, retryable: false }
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
