export type PageSurface =
  | 'landing'
  | 'auth'
  | 'activation'
  | 'fan'
  | 'pub'
  | 'other'

export function getPageSurface(pathname: string): PageSurface {
  if (pathname === '/') return 'landing'
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return 'auth'
  }
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/plan')) {
    return 'activation'
  }
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/pub')) {
    return 'fan'
  }
  if (pathname.startsWith('/admin')) return 'pub'
  return 'other'
}
