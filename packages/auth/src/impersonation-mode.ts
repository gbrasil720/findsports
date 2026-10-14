/**
 * WEB-390: na pele de alguém, o admin começa em "Só olhar" e só grava como
 * essa conta depois de trocar para "Pode agir" na faixa.
 *
 * O modo mora num cookie próprio cujo valor amarra o id da sessão impersonada
 * ao modo. Sem assinatura: quem está no navegador é o próprio admin, que pode
 * escolher "Pode agir" quando quiser. O que importa é que cookie faltando,
 * estragado ou de outra sessão nunca libere escrita — tudo isso é "Só olhar".
 *
 * Sem dependência de servidor: o cliente usa o mesmo arquivo para ler o modo
 * que veio na sessão.
 */

export const IMPERSONATION_MODE_COOKIE = 'onside_impersonation_mode'

export const READ_ONLY_IMPERSONATION_MESSAGE =
  'Só olhando: troque para Pode agir na faixa'

export const IMPERSONATION_MODES = ['look', 'act'] as const

export type ImpersonationMode = (typeof IMPERSONATION_MODES)[number]

export function impersonationModeCookieValue(
  sessionId: string,
  mode: ImpersonationMode
) {
  return `${sessionId}:${mode}`
}

function readCookie(header: string | null | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=')
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      // O `setCookie` do Start codifica o valor (`:` sai `%3A`).
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function impersonationModeFrom(
  cookieHeader: string | null | undefined,
  sessionId: string
): ImpersonationMode {
  const value = readCookie(cookieHeader, IMPERSONATION_MODE_COOKIE)
  return value === impersonationModeCookieValue(sessionId, 'act')
    ? 'act'
    : 'look'
}

type SessionLike = {
  session: { id: string; impersonatedBy?: string | null }
} | null

/** Sessão impersonada em "Só olhar": quem grava tem de recusar. */
export function isReadOnlyImpersonation(
  session: SessionLike | undefined,
  headers: Headers | undefined
) {
  if (!session?.session.impersonatedBy) return false
  return (
    impersonationModeFrom(headers?.get('cookie'), session.session.id) === 'look'
  )
}

/**
 * Rotas do better-auth que passam em "Só olhar" mesmo sem ser GET: sair da
 * pele, sair da conta e as que só leem ou descartam o cache da sessão.
 */
const OPEN_AUTH_PATHS = new Set([
  '/admin/stop-impersonating',
  '/sign-out',
  '/get-session',
  '/expire-session-cache'
])

/**
 * Rota do better-auth que grava. Método desconhecido (chamada por `auth.api`
 * sem `method`) conta como escrita: na dúvida, trava.
 */
export function isAuthWrite(path: string | undefined, method?: string) {
  if (path && OPEN_AUTH_PATHS.has(path)) return false
  return method?.toUpperCase() !== 'GET'
}
