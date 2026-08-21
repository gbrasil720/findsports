export function getSafeCallbackUrl(url: string, fallback = '/dashboard') {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return fallback
  }
  return url
}

export function getCallbackUrl(locationHref: string): string {
  const params = new URLSearchParams(locationHref.split('?')[1])
  const url = params.get('callbackUrl')
  if (!url) return '/dashboard'
  try {
    const parsed = new URL(url)
    const origin = new URL(locationHref).origin
    return parsed.origin === origin
      ? parsed.pathname + parsed.search
      : '/dashboard'
  } catch {
    return '/dashboard'
  }
}
