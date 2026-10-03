export function getSafeCallbackUrl(url: string, fallback = '/dashboard') {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return fallback
  }
  return url
}

// O router entrega `href` relativo, e o `callbackUrl` do diálogo do bar também
// é relativo: os dois resolvem contra a origem da página. No servidor não há
// `location`; a base fictícia só deixa passar caminho relativo, e o envio do
// formulário roda no cliente, onde a origem é a real.
export function getCallbackUrl(
  locationHref: string,
  origin: string = globalThis.location?.origin ?? 'http://origin.invalid'
): string {
  try {
    const url = new URL(locationHref, origin).searchParams.get('callbackUrl')
    if (!url) return '/dashboard'
    const parsed = new URL(url, origin)
    return parsed.origin === origin
      ? parsed.pathname + parsed.search
      : '/dashboard'
  } catch {
    return '/dashboard'
  }
}

// WEB-211: o destino do cadastro viaja na URL, e não no `sessionStorage`: o
// link do e-mail de verificação abre em outra aba. `/dashboard` é o padrão de
// `getCallbackUrl`, então nem vai junto.
export function withCallbackUrl(path: string, callbackUrl: string): string {
  if (callbackUrl === '/dashboard') return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}callbackUrl=${encodeURIComponent(callbackUrl)}`
}
