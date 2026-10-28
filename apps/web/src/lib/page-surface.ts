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
  // A página "está no app" (WEB-447), com bar, sem bar e no convite (WEB-468).
  if (
    pathname.startsWith('/torcedor') ||
    pathname.startsWith('/pub') ||
    pathname.startsWith('/convite')
  ) {
    return 'fan'
  }
  if (pathname.startsWith('/admin')) return 'pub'
  return 'other'
}
