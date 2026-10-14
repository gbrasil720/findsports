/**
 * WEB-383/384: guarda das rotas `/admin/*` do plugin admin do better-auth.
 *
 * - 2FA é obrigatório para agir como admin, no servidor e não só na tela do
 *   Houdini: senha de admin vazada sem o segundo fator não impersona nem bane.
 *   `/admin/stop-impersonating` fica de fora — quem pede é a sessão da pele.
 * - Rotas que o app não usa ficam desligadas: mudariam conta sem passar pelo
 *   Houdini nem deixar linha no Grimório.
 */

const DISABLED_ADMIN_PATHS = new Set([
  '/admin/create-user',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/update-user',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions'
])

type GuardSession = {
  user: { role?: string | null; twoFactorEnabled?: boolean | null }
} | null

export const ADMIN_2FA_REQUIRED_MESSAGE =
  'Ações de admin pedem autenticação em dois fatores ligada.'

export function adminRouteRefusal(
  path: string | undefined,
  session: GuardSession
): string | null {
  if (!path?.startsWith('/admin/')) return null
  if (DISABLED_ADMIN_PATHS.has(path)) {
    return 'Esta ação de admin não está disponível. Use o Houdini.'
  }
  if (path === '/admin/stop-impersonating') return null
  if (
    session?.user.role === 'admin' &&
    session.user.twoFactorEnabled !== true
  ) {
    return ADMIN_2FA_REQUIRED_MESSAGE
  }
  return null
}
