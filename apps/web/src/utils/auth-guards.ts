import { redirect } from '@tanstack/react-router'

export type AuthSession = {
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    ipAddress?: string | null
    userAgent?: string | null
    createdAt: Date
    updatedAt: Date
  }
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
    createdAt: Date
    updatedAt: Date
    role: 'fan' | 'pub' | 'admin'
    onboardingCompleted: boolean
    searchRadiusKm: number
  }
} | null

const PUBLIC_ROUTES = ['/', '/login', '/signup']

const isPublicRoute = (pathname: string) =>
  PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/pub/')

export function applyAuthGuards(session: AuthSession, pathname: string) {
  if (
    !session &&
    !isPublicRoute(pathname) &&
    !pathname.startsWith('/onboarding')
  ) {
    throw redirect({ to: '/login' })
  }

  if (!session) return

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

  // Fan tentando acessar área do bar
  if (session.user.role === 'fan' && pathname.startsWith('/admin')) {
    throw redirect({ to: '/dashboard' })
  }

  // Bar tentando acessar área do fan
  if (session.user.role === 'pub' && pathname.startsWith('/dashboard')) {
    throw redirect({ to: '/admin' })
  }

  // /plan é exclusivo para pub — fan vai pro dashboard, não autenticado vai pro sign-in
  if (pathname.startsWith('/plan') && session.user.role !== 'pub') {
    throw redirect({ to: '/dashboard' })
  }
}
