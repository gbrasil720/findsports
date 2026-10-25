import { describe, expect, test } from 'bun:test'
import {
  type AuthSession,
  applyAuthGuards,
  FAN_HOME,
  isHashOnlyChange,
  PUB_LIVE_PATH,
  requiresAuthentication,
  sessionAfterFailure,
  toClientSession
} from './auth-guards'

function session(role: 'fan' | 'pub' | 'admin', onboardingCompleted = true) {
  return {
    session: {
      id: 's1',
      userId: 'u1',
      expiresAt: new Date('2030-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      impersonatedBy: null,
      impersonationMode: null
    },
    user: {
      id: 'u1',
      name: 'Torcedor',
      email: 'fan@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      role,
      onboardingCompleted,
      searchRadiusKm: 5,
      twoFactorEnabled: false,
      banned: false
    }
  } satisfies NonNullable<AuthSession>
}

function redirectOf(fn: () => void): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { options?: { to?: string } }).options?.to
  }
  return undefined
}

describe('requiresAuthentication', () => {
  test('protects known app surfaces and their nested paths', () => {
    expect(requiresAuthentication('/admin')).toBe(true)
    expect(requiresAuthentication('/admin/billing')).toBe(true)
    expect(requiresAuthentication('/admin/validate')).toBe(true)
    expect(requiresAuthentication('/plan')).toBe(true)
    expect(requiresAuthentication('/plan/confirmed')).toBe(true)
    expect(requiresAuthentication('/app')).toBe(true)
  })

  test('leaves marketing, auth, pubs, pub onboarding and unknown URLs public', () => {
    expect(requiresAuthentication('/')).toBe(false)
    expect(requiresAuthentication('/login')).toBe(false)
    expect(requiresAuthentication('/signup')).toBe(false)
    expect(requiresAuthentication('/pub/abc')).toBe(false)
    expect(requiresAuthentication(FAN_HOME)).toBe(false)
    // O painel do torcedor saiu do web: `/dashboard` é URL desconhecida.
    expect(requiresAuthentication('/dashboard')).toBe(false)
    expect(requiresAuthentication('/internal')).toBe(false)
    expect(requiresAuthentication('/verify-email')).toBe(false)
    expect(requiresAuthentication('/forgot-password')).toBe(false)
    expect(requiresAuthentication('/reset-password')).toBe(false)
    expect(requiresAuthentication('/onboarding/pub')).toBe(false)
    expect(requiresAuthentication('/pagina-que-nao-existe')).toBe(false)
    expect(requiresAuthentication('/api/trpc/pubs.list')).toBe(false)
  })
})

describe('applyAuthGuards', () => {
  test('sends visitors on protected routes to login', () => {
    expect(redirectOf(() => applyAuthGuards(null, '/admin'))).toBe('/login')
    expect(redirectOf(() => applyAuthGuards(null, '/plan'))).toBe('/login')
  })

  // WEB-210: o destino original volta como callbackUrl, com a query.
  test('carries the requested path and query to login as callbackUrl', () => {
    let thrown: unknown
    try {
      applyAuthGuards(null, '/admin', { tab: 'eventos' }, '/admin?tab=eventos')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      options: { to: '/login', search: { callbackUrl: '/admin?tab=eventos' } }
    })
  })

  // WEB-278: sessão pronta não fica olhando o formulário de login.
  test('sends signed-in bars away from login and signup', () => {
    for (const [onboarded, href, to] of [
      [true, '/login', '/admin'],
      [true, '/signup', '/admin'],
      [true, '/login?callbackUrl=%2Fadmin%2Fjogos', '/admin/jogos'],
      [false, '/login', '/onboarding/pub']
    ] as const) {
      expect(
        redirectOf(() =>
          applyAuthGuards(
            session('pub', onboarded),
            href.split('?')[0] ?? href,
            {},
            href
          )
        )
      ).toBe(to)
    }
    expect(() => applyAuthGuards(null, '/login')).not.toThrow()
  })

  test('lets visitors stay on public pages and unknown URLs', () => {
    for (const path of ['/pagina-que-nao-existe', '/pub/bar-1', FAN_HOME]) {
      expect(() => applyAuthGuards(null, path)).not.toThrow()
    }
  })

  test('keeps pub onboarding reachable without a session', () => {
    expect(() => applyAuthGuards(null, '/onboarding/pub')).not.toThrow()
  })

  test('torcedor logado no web vai à página do app', () => {
    for (const onboarded of [true, false]) {
      for (const path of [
        '/admin',
        '/admin/validate',
        '/plan',
        '/plan/confirmed',
        '/app',
        '/login',
        '/signup',
        '/',
        '/onboarding/pub',
        '/onboarding/fan'
      ]) {
        expect(
          redirectOf(() => applyAuthGuards(session('fan', onboarded), path)),
          path
        ).toBe(FAN_HOME)
      }
    }
    expect(
      redirectOf(() =>
        applyAuthGuards(
          session('admin'),
          '/login',
          {},
          '/login?callbackUrl=%2Fhoudini'
        )
      )
    ).toBe('/houdini')
    for (const path of [FAN_HOME, '/pub/bar-123', '/termos']) {
      expect(() => applyAuthGuards(session('fan'), path), path).not.toThrow()
    }
  })

  test('encaminha o bar sem onboarding para o onboarding do bar', () => {
    for (const path of ['/admin', '/plan', '/', '/onboarding/fan']) {
      expect(
        redirectOf(() => applyAuthGuards(session('pub', false), path))
      ).toBe('/onboarding/pub')
    }
    expect(() =>
      applyAuthGuards(session('pub', false), '/onboarding/pub')
    ).not.toThrow()
  })

  test('bar pronto sai do onboarding, menos da tela "No ar"', () => {
    expect(
      redirectOf(() => applyAuthGuards(session('pub'), '/onboarding/pub'))
    ).toBe('/admin')
    expect(() => applyAuthGuards(session('pub'), PUB_LIVE_PATH)).not.toThrow()
  })

  test('keeps verification reachable before onboarding finishes', () => {
    expect(() =>
      applyAuthGuards(session('pub', false), '/verify-email')
    ).not.toThrow()
  })

  test('mantém a recuperação de senha aberta mesmo com sessão no navegador', () => {
    // Quem clica no link do e-mail pode ter cookie de outra conta, ou de uma
    // conta que ainda não passou pelo onboarding. Em qualquer um desses casos
    // a tela precisa abrir, senão o token é gasto sem redefinir.
    for (const pathname of ['/forgot-password', '/reset-password']) {
      expect(() =>
        applyAuthGuards(session('pub', false), pathname)
      ).not.toThrow()
      expect(() => applyAuthGuards(session('fan'), pathname)).not.toThrow()
      expect(() => applyAuthGuards(null, pathname)).not.toThrow()
    }
  })

  test('bar pronto entra no painel e no plano', () => {
    for (const path of [
      '/admin',
      '/admin/validate',
      '/plan',
      '/plan/confirmed'
    ]) {
      expect(() => applyAuthGuards(session('pub'), path), path).not.toThrow()
    }
  })

  test('admin fica na landing e vai à página do app fora dela', () => {
    expect(() => applyAuthGuards(session('admin'), '/')).not.toThrow()
    expect(() =>
      applyAuthGuards(session('admin'), '/pub/bar-123')
    ).not.toThrow()
    expect(redirectOf(() => applyAuthGuards(session('admin'), '/plan'))).toBe(
      FAN_HOME
    )
  })

  test('redireciona o bar pronto da landing para o painel', () => {
    expect(redirectOf(() => applyAuthGuards(session('pub'), '/'))).toBe(
      '/admin'
    )
  })

  test('mantém a landing quando a intenção pública está explícita', () => {
    expect(() =>
      applyAuthGuards(session('fan'), '/', { public: '1' })
    ).not.toThrow()
    expect(() =>
      applyAuthGuards(session('pub'), '/', { public: '1' })
    ).not.toThrow()
    // `/?public=1` digitado: o router entrega o valor já como número.
    expect(() =>
      applyAuthGuards(session('fan'), '/', { public: 1 })
    ).not.toThrow()
  })

  test('o marcador público não ignora o onboarding do bar', () => {
    expect(() =>
      applyAuthGuards(session('pub', false), '/', { public: '1' })
    ).toThrow()
  })

  test('mantém visitante na landing', () => {
    expect(() => applyAuthGuards(null, '/')).not.toThrow()
  })
})

describe('Houdini (WEB-383)', () => {
  test('não é público nem protegido pelo guard da raiz: o portão decide', () => {
    expect(requiresAuthentication('/houdini')).toBe(false)
    expect(() => applyAuthGuards(null, '/houdini/pessoas')).not.toThrow()
    expect(() =>
      applyAuthGuards(session('fan', false), '/houdini')
    ).not.toThrow()
    expect(() =>
      applyAuthGuards(session('pub'), '/houdini/bares')
    ).not.toThrow()
  })
})

describe('isHashOnlyChange', () => {
  const admin = { pathname: '/admin', searchStr: '', hash: 'admin-grade' }

  test('só a troca de hash reaproveita a sessão', () => {
    expect(isHashOnlyChange(admin, { ...admin, hash: 'admin-espaco' })).toBe(
      true
    )
  })

  test('mesma URL, outro path ou outra query conferem de novo', () => {
    expect(isHashOnlyChange(admin, { ...admin })).toBe(false)
    expect(isHashOnlyChange(admin, { ...admin, pathname: '/login' })).toBe(
      false
    )
    expect(isHashOnlyChange(admin, { ...admin, searchStr: '?public=1' })).toBe(
      false
    )
  })
})

describe('sessionAfterFailure', () => {
  const last = { session: session('pub') }
  const semRede = new TypeError('Failed to fetch')

  test('sem rede, a troca de tela fica com a última sessão conferida', () => {
    expect(sessionAfterFailure(semRede, last)).toBe(last.session)
    expect(sessionAfterFailure({ status: 503 }, last)).toBe(last.session)
  })

  test('saiu da conta ou foi a primeira conferência: o erro segue', () => {
    expect(() => sessionAfterFailure(semRede, undefined)).toThrow(semRede)
  })

  test('recusa do servidor não usa a sessão guardada', () => {
    const recusa = { status: 401, message: 'Unauthorized' }
    expect(() => sessionAfterFailure(recusa, last)).toThrow()
  })
})

type BetterAuthSession = Parameters<typeof toClientSession>[0]

describe('toClientSession', () => {
  test('o token do cookie httpOnly não sai do servidor', () => {
    const fromBetterAuth = {
      user: { id: 'u1', role: 'pub' },
      session: {
        id: 's1',
        userId: 'u1',
        token: 'cookie-httponly',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date('2030-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        impersonatedBy: 'admin-1'
      }
    } as unknown as BetterAuthSession

    const client = toClientSession(fromBetterAuth)

    expect(JSON.stringify(client)).not.toContain('cookie-httponly')
    expect(client?.session).toEqual({
      id: 's1',
      userId: 'u1',
      expiresAt: new Date('2030-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      impersonatedBy: 'admin-1',
      impersonationMode: 'look'
    })
    expect(client?.user).toBe(fromBetterAuth?.user)
    expect(
      toClientSession(
        fromBetterAuth,
        new Headers({ cookie: 'onside_impersonation_mode=s1:act' })
      )?.session.impersonationMode
    ).toBe('act')
  })

  test('sem sessão continua null', () => {
    expect(toClientSession(null)).toBeNull()
  })
})
