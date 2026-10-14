import { appHref, isPublicAppHost } from './houdini-host'

/**
 * WEB-383: quem vê o quê no Houdini. Roda no servidor a cada navegação
 * (`functions/houdini-gate.ts`), para que o 404 seja de verdade — status e
 * conteúdo iguais para todos que não são admin — e nada do Houdini chegue a
 * quem não deve.
 *
 * - `blocked`: o caminho `/houdini` no domínio público. Admin é mandado para o
 *   host próprio; o resto vê o 404 comum do app.
 * - `hidden`: sessão que não é de admin. 404, a Cortina.
 * - `visitor`: sem sessão. 404 em tudo, menos a Entrada.
 * - `impersonating`: admin na pele de alguém (a sessão é da outra conta).
 * - `needs2fa`: admin sem 2FA ligado.
 * - `ok`.
 */
export type HoudiniGate =
  | { kind: 'blocked'; redirectTo: string | null }
  | { kind: 'hidden' }
  | { kind: 'visitor'; loginHref: string }
  | { kind: 'impersonating'; name: string; email: string }
  | { kind: 'needs2fa' | 'ok'; env: HoudiniEnv }

export type HoudiniEnv = 'produção' | 'preview' | 'local'

export type GateSession = {
  user: {
    role?: string | null
    name: string
    email: string
    twoFactorEnabled?: boolean | null
  }
  session: { impersonatedBy?: string | null }
} | null

function envFor(hostname: string): HoudiniEnv {
  if (hostname === 'houdini.onside.sh') return 'produção'
  if (hostname.endsWith('.workers.dev')) return 'preview'
  return 'local'
}

export function decideHoudiniGate(url: URL, session: GateSession): HoudiniGate {
  const isAdmin = session?.user.role === 'admin'
  const impersonating = Boolean(session?.session.impersonatedBy)

  if (isPublicAppHost(url.hostname)) {
    return {
      kind: 'blocked',
      redirectTo:
        isAdmin && !impersonating ? `${url.protocol}//houdini.onside.sh/` : null
    }
  }
  if (session && impersonating) {
    return {
      kind: 'impersonating',
      name: session.user.name,
      email: session.user.email
    }
  }
  if (!session) {
    return {
      kind: 'visitor',
      loginHref: appHref('/login?callbackUrl=%2Fhoudini', url)
    }
  }
  if (!isAdmin) return { kind: 'hidden' }

  const env = envFor(url.hostname)
  if (session.user.twoFactorEnabled !== true) return { kind: 'needs2fa', env }
  return { kind: 'ok', env }
}
