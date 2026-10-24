import type { auth } from '@findsports_oficial/auth'
import { impersonationModeFrom } from '@findsports_oficial/auth/impersonation-mode'
import { redirect } from '@tanstack/react-router'
import { getCallbackUrl } from './callback-url'

/** A tela "Seu bar está no ar" (4r), depois do cadastro do bar. */
export const PUB_LIVE_PATH = '/onboarding/pub/no-ar'

export type AuthSession = ReturnType<typeof toClientSession>

const AUTHENTICATED_PREFIXES = [
  '/admin',
  '/plan',
  // `start_url` do PWA: abrir o ícone da tela inicial sem sessão tem que cair
  // no login, e não numa tela em branco.
  '/app'
] as const

/**
 * O web é só para bares (decisão do dono, 24/10/2026): torcedor logado que
 * abre o web cai na página que leva ao app. Admin também, fora do Houdini e
 * da landing: o web não tem mais tela de torcedor para ele navegar.
 */
export const FAN_HOME = '/torcedor'

export function requiresAuthentication(pathname: string) {
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function applyAuthGuards(
  session: AuthSession,
  pathname: string,
  search: Record<string, unknown> = {},
  href = pathname
) {
  // Unknown URLs stay public so the 404 page can render for visitors.
  // /onboarding/pub stays public — o rascunho pré-cadastro depende do fluxo
  // de verificação de e-mail, que precisa funcionar antes da sessão existir.
  // WEB-210: `href` relativo (caminho + query) volta como destino do login;
  // `getCallbackUrl` só aceita mesma origem.
  // WEB-383: o Houdini tem portão próprio (`lib/houdini-gate`), que vale
  // também para sessão impersonada de conta sem onboarding.
  if (pathname === '/houdini' || pathname.startsWith('/houdini/')) return

  if (!session && requiresAuthentication(pathname)) {
    throw redirect({ to: '/login', search: { callbackUrl: href } })
  }

  if (!session) return

  // O callback precisa finalizar o login e, para bares, consumir o rascunho
  // do onboarding antes que o guard encaminhe para a rota seguinte.
  if (pathname.startsWith('/verify-email')) return

  // WEB-53: recuperação de senha tem que abrir mesmo com cookie de sessão no
  // navegador — é justamente o caso de quem esqueceu a senha numa aba antiga,
  // ou de quem clica no link do e-mail logado em outra conta. Sem isto, o
  // guard abaixo mandaria essa pessoa para o onboarding e o link do e-mail
  // seria consumido sem redefinir nada.
  if (
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  ) {
    return
  }

  const pub = session.user.role === 'pub'

  // O onboarding de torcedor é só do app: no web, quem não é bar vai à
  // página do app, com ou sem onboarding feito.
  if (!pub) {
    if (
      requiresAuthentication(pathname) ||
      pathname.startsWith('/onboarding')
    ) {
      throw redirect({ to: FAN_HOME })
    }
    // WEB-278: sessão pronta não fica olhando o formulário de login; segue o
    // destino pedido (o do admin para o Houdini) ou vai à página do app.
    if (pathname === '/login' || pathname === '/signup') {
      const destino = getCallbackUrl(href)
      throw redirect({ to: destino === '/admin' ? FAN_HOME : destino })
    }
    // Landing: o torcedor vai ao app; admin fica (é o "Ir para o site" dele).
    // `String()`: o router faz JSON.parse da query, e `/?public=1` digitado
    // chega como número; só o link interno é string.
    if (
      pathname === '/' &&
      session.user.role === 'fan' &&
      String(search.public) !== '1'
    ) {
      throw redirect({ to: FAN_HOME })
    }
    return
  }

  if (!session.user.onboardingCompleted) {
    if (!pathname.startsWith('/onboarding/pub')) {
      throw redirect({ to: '/onboarding/pub' })
    }
    return
  }

  // "No ar" (4r) é a tela depois do cadastro: só existe com o bar criado.
  if (pathname.startsWith('/onboarding') && pathname !== PUB_LIVE_PATH) {
    throw redirect({ to: '/admin' })
  }

  // WEB-278: quem já tem sessão não vê o formulário de login nem o de
  // cadastro; segue para o destino que a URL levava (`/admin` por padrão).
  if (pathname === '/login' || pathname === '/signup') {
    throw redirect({ to: getCallbackUrl(href) })
  }

  // Landing é para visitantes: o bar vai ao painel.
  if (pathname === '/' && String(search.public) !== '1') {
    throw redirect({ to: '/admin' })
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
 * A sessão que sai do servidor. O `authMiddleware` devolve este contexto às
 * server functions e ao cliente — no SSR, serializado no HTML da página —, então só
 * passa o que o cliente usa. `token` é o valor do cookie httpOnly (WEB-149).
 */
export function toClientSession(
  session: Awaited<ReturnType<typeof auth.api.getSession>>,
  headers?: Headers
) {
  if (!session) return null
  const { id, userId, expiresAt, createdAt, updatedAt, impersonatedBy } =
    session.session
  return {
    user: session.user,
    session: {
      id,
      userId,
      expiresAt,
      createdAt,
      updatedAt,
      impersonatedBy,
      // WEB-390: o modo da pele, para a faixa; quem trava é o servidor.
      impersonationMode: impersonatedBy
        ? impersonationModeFrom(headers?.get('cookie'), id)
        : null
    }
  }
}
