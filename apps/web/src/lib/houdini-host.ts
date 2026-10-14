/**
 * WEB-383: o Houdini mora em `houdini.onside.sh`, servido pelo mesmo Worker.
 * As rotas dele são `/houdini/*`; no host próprio o prefixo some da URL (o
 * `rewrite` do router, em `router.tsx`). No domínio público (`www.onside.sh`)
 * `/houdini` não existe para ninguém. Fora dele — preview no workers.dev,
 * `vite dev` — não há subdomínio, e o Houdini responde no caminho.
 */

export const HOUDINI_PREFIX = '/houdini'

/** `houdini.onside.sh`, e `houdini.localhost` para testar o modo host local. */
export function isHoudiniHost(hostname: string) {
  return hostname.startsWith('houdini.')
}

/** Domínio público do app: lá o Houdini não responde no caminho. */
export function isPublicAppHost(hostname: string) {
  return (
    !isHoudiniHost(hostname) &&
    (hostname === 'onside.sh' || hostname.endsWith('.onside.sh'))
  )
}

/** Rotas do servidor que o Houdini usa como estão: tRPC, auth, arquivos. */
function keepsPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function isHoudiniPath(pathname: string) {
  return (
    pathname === HOUDINI_PREFIX || pathname.startsWith(`${HOUDINI_PREFIX}/`)
  )
}

/** URL pública do host do Houdini → caminho interno `/houdini/*`. */
export function houdiniRewriteInput(url: URL) {
  if (!isHoudiniHost(url.hostname) || keepsPath(url.pathname)) return
  if (isHoudiniPath(url.pathname)) return
  url.pathname =
    url.pathname === '/' ? HOUDINI_PREFIX : `${HOUDINI_PREFIX}${url.pathname}`
  return url
}

/** Caminho interno `/houdini/*` → URL pública, no host do Houdini. */
export function houdiniRewriteOutput(url: URL) {
  if (!isHoudiniHost(url.hostname) || !isHoudiniPath(url.pathname)) return
  url.pathname = url.pathname.slice(HOUDINI_PREFIX.length) || '/'
  return url
}

/**
 * Endereço de uma página do app (`/login`, `/dashboard`) visto de onde se
 * está. No host do Houdini é o domínio público (`houdini.onside.sh` →
 * `www.onside.sh`; `houdini.localhost` → `localhost`); fora dele, o caminho.
 */
export function appHref(path: string, here: URL) {
  if (!isHoudiniHost(here.hostname)) return path
  const app = new URL(path, here)
  app.hostname =
    here.hostname === 'houdini.onside.sh'
      ? 'www.onside.sh'
      : here.hostname.replace(/^houdini\./, '')
  return app.href
}

/**
 * Endereço de uma página do Houdini (`/houdini/pessoas`) visto de onde se
 * está. Do domínio público vai para `houdini.onside.sh/pessoas`; no host do
 * Houdini o `rewrite` cuida do prefixo; no preview e local é o caminho.
 */
export function houdiniHref(path: string, here: URL) {
  if (!isPublicAppHost(here.hostname)) return path
  const url = new URL(path.slice(HOUDINI_PREFIX.length) || '/', here)
  url.hostname = 'houdini.onside.sh'
  return url.href
}
