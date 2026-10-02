import type { auth } from '@findsports_oficial/auth'
import { redirect } from '@tanstack/react-router'

export type AuthSession = ReturnType<typeof toClientSession>

const AUTHENTICATED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/plan',
  '/internal',
  // `start_url` do PWA: abrir o ícone da tela inicial sem sessão tem que cair
  // no login, e não numa tela em branco.
  '/app',
  // O onboarding de torcedor chama `pubs.getSports` e `onboarding.completeFan`,
  // ambos protegidos — visitante precisa criar sessão antes de entrar.
  '/onboarding/fan'
] as const

export function requiresAuthentication(pathname: string) {
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function applyAuthGuards(
  session: AuthSession,
  pathname: string,
  search: Record<string, unknown> = {}
) {
  // Unknown URLs stay public so the 404 page can render for visitors.
  // /onboarding/pub stays public — o rascunho pré-cadastro depende do fluxo
  // de verificação de e-mail, que precisa funcionar antes da sessão existir.
  if (!session && requiresAuthentication(pathname)) {
    throw redirect({ to: '/login' })
  }

  if (!session) return

  // O callback precisa finalizar o login e, para bares, consumir o rascunho
  // do onboarding antes que o guard encaminhe para a rota seguinte.
  if (pathname.startsWith('/verify-email')) return

  // WEB-53: recuperação de senha tem que abrir mesmo com cookie de sessão no
  // navegador — é justamente o caso de quem esqueceu a senha numa aba antiga,
  // ou de quem clica no link do e-mail logado em outra conta. Sem isto, o
  // guard abaixo mandaria essa pessoa para `/access-pending` ou para o
  // onboarding e o link do e-mail seria consumido sem redefinir nada.
  if (
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  ) {
    return
  }

  if (
    session.user.role !== 'admin' &&
    session.user.admittedAt === null &&
    !pathname.startsWith('/access-pending')
  ) {
    throw redirect({ to: '/access-pending' })
  }

  if (
    session.user.admittedAt !== null &&
    pathname.startsWith('/access-pending')
  ) {
    throw redirect({
      to: session.user.onboardingCompleted
        ? session.user.role === 'pub'
          ? '/admin'
          : '/dashboard'
        : session.user.role === 'pub'
          ? '/onboarding/pub'
          : '/onboarding/fan'
    })
  }

  if (!session.user.onboardingCompleted) {
    const onboardingRoute =
      session.user.role === 'pub' ? '/onboarding/pub' : '/onboarding/fan'

    if (!pathname.startsWith(onboardingRoute)) {
      throw redirect({ to: onboardingRoute })
    }
    return
  }

  if (pathname.startsWith('/onboarding')) {
    throw redirect({
      to: session.user.role === 'pub' ? '/plan' : '/dashboard'
    })
  }

  // Landing é exclusiva para visitantes — sessão pronta vai para a superfície do papel.
  // Admin permanece na landing.
  // `String()`: o router faz JSON.parse da query, e `/?public=1` digitado
  // chega como número; só o link interno (`search={{ public: '1' }}`) é string.
  if (pathname === '/' && String(search.public) !== '1') {
    if (session.user.role === 'fan') {
      throw redirect({ to: '/dashboard' })
    }
    if (session.user.role === 'pub') {
      throw redirect({ to: '/admin' })
    }
  }

  // Não-admin tentando acessar área interna
  if (pathname.startsWith('/internal') && session.user.role !== 'admin') {
    throw redirect({
      to: session.user.role === 'pub' ? '/admin' : '/dashboard'
    })
  }

  // Fan tentando acessar área do bar
  if (session.user.role === 'fan' && pathname.startsWith('/admin')) {
    throw redirect({ to: '/dashboard' })
  }

  // Bar tentando acessar área do fan
  if (session.user.role === 'pub' && pathname.startsWith('/dashboard')) {
    throw redirect({ to: '/admin' })
  }

  // Admin tentando acessar área do fan
  if (session.user.role === 'admin' && pathname.startsWith('/dashboard')) {
    throw redirect({ to: '/internal' })
  }

  // /plan é exclusivo para pub — fan vai pro dashboard, não autenticado vai pro sign-in
  if (pathname.startsWith('/plan') && session.user.role !== 'pub') {
    throw redirect({ to: '/dashboard' })
  }
}

export type SessionLocation = {
  pathname: string
  searchStr: string
  hash: string
}

/**
 * Se a sessão conferida em `previous` ainda vale para `next` sem nova ida ao
 * servidor. Só a troca de hash — as abas do /admin — reaproveita (WEB-140):
 * com path e query iguais o guard decide igual, e sign-out e login sempre
 * trocam o path. A mesma URL de novo (`router.invalidate`, clique repetido)
 * confere outra vez.
 */
export function isHashOnlyChange(
  previous: SessionLocation,
  next: SessionLocation
) {
  return (
    previous.pathname === next.pathname &&
    previous.searchStr === next.searchStr &&
    previous.hash !== next.hash
  )
}

/**
 * A sessão que sai do servidor. `getSession` e `getUser` devolvem este
 * contexto ao cliente — no SSR, serializado no HTML da página —, então só
 * passa o que o cliente usa. `token` é o valor do cookie httpOnly (WEB-149).
 */
export function toClientSession(
  session: Awaited<ReturnType<typeof auth.api.getSession>>
) {
  if (!session) return null
  const { id, userId, expiresAt, createdAt, updatedAt, impersonatedBy } =
    session.session
  return {
    user: session.user,
    session: { id, userId, expiresAt, createdAt, updatedAt, impersonatedBy }
  }
}
