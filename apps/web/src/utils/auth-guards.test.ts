import { describe, expect, test } from 'bun:test'
import {
  type AuthSession,
  applyAuthGuards,
  isHashOnlyChange,
  requiresAuthentication,
  toClientSession
} from './auth-guards'

function session(
  role: 'fan' | 'pub' | 'admin',
  onboardingCompleted = true,
  admittedAt: Date | null | undefined = undefined
) {
  return {
    session: {
      id: 's1',
      userId: 'u1',
      expiresAt: new Date('2030-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      impersonatedBy: null
    },
    user: {
      id: 'u1',
      name: 'Torcedor',
      email: 'fan@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      role,
      admittedAt,
      onboardingCompleted,
      searchRadiusKm: 5,
      twoFactorEnabled: false,
      banned: false
    }
  } satisfies NonNullable<AuthSession>
}

describe('requiresAuthentication', () => {
  test('protects known app surfaces and their nested paths', () => {
    expect(requiresAuthentication('/dashboard')).toBe(true)
    expect(requiresAuthentication('/dashboard/profile')).toBe(true)
    expect(requiresAuthentication('/admin')).toBe(true)
    expect(requiresAuthentication('/admin/billing')).toBe(true)
    expect(requiresAuthentication('/admin/validate')).toBe(true)
    expect(requiresAuthentication('/plan')).toBe(true)
    expect(requiresAuthentication('/plan/confirmed')).toBe(true)
    expect(requiresAuthentication('/internal')).toBe(true)
    expect(requiresAuthentication('/internal/waitlist')).toBe(true)
    expect(requiresAuthentication('/onboarding/fan')).toBe(true)
    expect(requiresAuthentication('/access-pending')).toBe(true)
  })

  test('leaves marketing, auth, pubs, pub onboarding and unknown URLs public', () => {
    expect(requiresAuthentication('/')).toBe(false)
    expect(requiresAuthentication('/login')).toBe(false)
    expect(requiresAuthentication('/signup')).toBe(false)
    expect(requiresAuthentication('/pub/abc')).toBe(false)
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
    expect(() => applyAuthGuards(null, '/dashboard')).toThrow()
    expect(() => applyAuthGuards(null, '/admin')).toThrow()
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

  test('sends visitors from the pending access screen to login with its destination', () => {
    const href = '/access-pending?callbackUrl=%2Fapp'
    let thrown: unknown
    try {
      applyAuthGuards(null, '/access-pending', {}, href)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      options: { to: '/login', search: { callbackUrl: href } }
    })
  })

  test('lets visitors stay on unknown URLs so the 404 can render', () => {
    expect(() => applyAuthGuards(null, '/pagina-que-nao-existe')).not.toThrow()
  })

  test('sends visitors from fan onboarding to login', () => {
    expect(() => applyAuthGuards(null, '/onboarding/fan')).toThrow()
  })

  test('keeps pub onboarding reachable without a session', () => {
    expect(() => applyAuthGuards(null, '/onboarding/pub')).not.toThrow()
  })

  test('mantém o torcedor logado no onboarding do fan enquanto não conclui', () => {
    expect(() =>
      applyAuthGuards(session('fan', false), '/onboarding/fan')
    ).not.toThrow()
  })

  test('encaminha o pub logado sem onboarding para o onboarding do pub', () => {
    try {
      applyAuthGuards(session('pub', false), '/onboarding/fan')
      throw new Error('pub deveria ser redirecionado')
    } catch (error) {
      expect((error as { options?: { to?: string } }).options?.to).toBe(
        '/onboarding/pub'
      )
    }
  })

  test('desvia da rota de onboarding quem já concluiu', () => {
    try {
      applyAuthGuards(session('fan'), '/onboarding/fan')
      throw new Error('fan pronto deveria sair do onboarding')
    } catch (error) {
      expect((error as { options?: { to?: string } }).options?.to).toBe(
        '/dashboard'
      )
    }
  })

  test('sends unfinished fans to fan onboarding', () => {
    expect(() => applyAuthGuards(session('fan', false), '/dashboard')).toThrow()
  })

  test('keeps verification reachable before onboarding finishes', () => {
    expect(() =>
      applyAuthGuards(session('pub', false), '/verify-email')
    ).not.toThrow()
  })

  test('mantém a recuperação de senha aberta mesmo com sessão no navegador', () => {
    // Quem clica no link do e-mail pode ter cookie de outra conta, ou de uma
    // conta que ainda não passou pelo onboarding/aprovação. Em qualquer um
    // desses casos a tela precisa abrir, senão o token é gasto sem redefinir.
    for (const pathname of ['/forgot-password', '/reset-password']) {
      expect(() =>
        applyAuthGuards(session('pub', false), pathname)
      ).not.toThrow()
      expect(() =>
        applyAuthGuards(session('fan', true, null), pathname)
      ).not.toThrow()
      expect(() => applyAuthGuards(session('fan'), pathname)).not.toThrow()
      expect(() => applyAuthGuards(null, pathname)).not.toThrow()
    }
  })

  test('sends an existing unapproved account to the pending access screen', () => {
    expect(() =>
      applyAuthGuards(session('fan', true, null), '/dashboard')
    ).toThrow()
    expect(() =>
      applyAuthGuards(session('fan', true, null), '/access-pending')
    ).not.toThrow()
    // Sem onboarding também espera aqui, sem laço com o onboarding.
    for (const role of ['fan', 'pub'] as const) {
      expect(() =>
        applyAuthGuards(session(role, false, null), '/access-pending')
      ).not.toThrow()
    }
  })

  test('carries the requested path through the pending access screen', () => {
    function redirectOf(...args: Parameters<typeof applyAuthGuards>) {
      try {
        applyAuthGuards(...args)
      } catch (error) {
        return (error as { options?: unknown }).options
      }
    }
    expect(
      redirectOf(session('fan', true, null), '/app', {}, '/app?evento=1')
    ).toMatchObject({
      to: '/access-pending',
      search: { callbackUrl: '/app?evento=1' }
    })
    const pending = '/access-pending?callbackUrl=%2Fapp%3Fevento%3D1'
    // Liberado: segue para o destino, ou passa pelo onboarding levando-o.
    expect(
      redirectOf(session('fan'), '/access-pending', {}, pending)
    ).toMatchObject({ to: '/app?evento=1' })
    expect(
      redirectOf(session('fan', false), '/access-pending', {}, pending)
    ).toMatchObject({
      to: '/onboarding/fan?callbackUrl=%2Fapp%3Fevento%3D1'
    })
    // O bar leva o destino pelo onboarding dele, como o torcedor.
    expect(
      redirectOf(session('pub', false), '/access-pending', {}, pending)
    ).toMatchObject({
      to: '/onboarding/pub?callbackUrl=%2Fapp%3Fevento%3D1'
    })
    // Quem esperou a liberação em `/onboarding/pub` não volta para ela
    // carregando a si mesma: onboarding sem destino, ou casa se já concluiu.
    const fromOnboarding = '/access-pending?callbackUrl=%2Fonboarding%2Fpub'
    expect(
      redirectOf(session('pub', false), '/access-pending', {}, fromOnboarding)
    ).toMatchObject({ to: '/onboarding/pub' })
    expect(
      redirectOf(session('pub'), '/access-pending', {}, fromOnboarding)
    ).toMatchObject({ to: '/admin' })
    // O destino que o onboarding levava sobrevive.
    expect(
      redirectOf(
        session('fan', false),
        '/access-pending',
        {},
        '/access-pending?callbackUrl=%2Fonboarding%2Ffan%3FcallbackUrl%3D%252Fapp'
      )
    ).toMatchObject({ to: '/onboarding/fan?callbackUrl=%2Fapp' })
    // Sem destino, a casa do papel.
    expect(redirectOf(session('pub'), '/access-pending')).toMatchObject({
      to: '/admin'
    })
    expect(redirectOf(session('fan'), '/access-pending')).toMatchObject({
      to: '/dashboard'
    })
    // Destino de outra origem cai no padrão.
    expect(
      redirectOf(
        session('fan'),
        '/access-pending',
        {},
        '/access-pending?callbackUrl=https%3A%2F%2Fevil.example'
      )
    ).toMatchObject({ to: '/dashboard' })
  })

  test('separa as superfícies de fan, bar e admin por papel', () => {
    expect(() => applyAuthGuards(session('fan'), '/admin')).toThrow()
    expect(() => applyAuthGuards(session('fan'), '/admin/validate')).toThrow()
    expect(() => applyAuthGuards(session('fan'), '/plan')).toThrow()
    // WEB-59: o recibo mora sob `/plan` justamente para herdar este corte.
    expect(() => applyAuthGuards(session('fan'), '/plan/confirmed')).toThrow()
    expect(() =>
      applyAuthGuards(session('pub'), '/plan/confirmed')
    ).not.toThrow()
    expect(() => applyAuthGuards(session('fan'), '/internal')).toThrow()
    expect(() => applyAuthGuards(session('pub'), '/dashboard')).toThrow()
    expect(() => applyAuthGuards(session('pub'), '/internal')).toThrow()
    expect(() => applyAuthGuards(session('admin'), '/internal')).not.toThrow()

    try {
      applyAuthGuards(session('admin'), '/dashboard/profile')
      throw new Error('admin deveria ser redirecionado')
    } catch (error) {
      expect((error as { options?: { to?: string } }).options?.to).toBe(
        '/internal'
      )
    }
  })

  test('mantém o perfil público do bar acessível a qualquer papel', () => {
    expect(() => applyAuthGuards(session('fan'), '/pub/bar-123')).not.toThrow()
  })

  test('redireciona sessão pronta da landing para a superfície do papel', () => {
    try {
      applyAuthGuards(session('fan'), '/')
      throw new Error('fan deveria ser redirecionado')
    } catch (error) {
      expect((error as { options?: { to?: string } }).options?.to).toBe(
        '/dashboard'
      )
    }

    try {
      applyAuthGuards(session('pub'), '/')
      throw new Error('pub deveria ser redirecionado')
    } catch (error) {
      expect((error as { options?: { to?: string } }).options?.to).toBe(
        '/admin'
      )
    }
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

  test('o marcador público não ignora as guardas de acesso', () => {
    expect(() =>
      applyAuthGuards(session('fan', true, null), '/', { public: '1' })
    ).toThrow()
    expect(() =>
      applyAuthGuards(session('fan', false), '/', { public: '1' })
    ).toThrow()
  })

  test('mantém admin pronto na landing', () => {
    expect(() => applyAuthGuards(session('admin'), '/')).not.toThrow()
  })

  test('mantém visitante na landing', () => {
    expect(() => applyAuthGuards(null, '/')).not.toThrow()
  })

  test('não admitido na landing vai para o acesso pendente', () => {
    expect(() => applyAuthGuards(session('fan', true, null), '/')).toThrow()
  })

  test('sem onboarding na landing vai para o onboarding do papel', () => {
    expect(() => applyAuthGuards(session('fan', false), '/')).toThrow()
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
      impersonatedBy: 'admin-1'
    })
    expect(client?.user).toBe(fromBetterAuth?.user)
  })

  test('sem sessão continua null', () => {
    expect(toClientSession(null)).toBeNull()
  })
})
