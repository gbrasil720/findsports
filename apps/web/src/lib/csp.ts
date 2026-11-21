/**
 * Content-Security-Policy das páginas do web (audit de segurança, 20/11/2026).
 *
 * Script só com o nonce desta resposta: o TanStack põe o nonce em todo
 * `<script>` e `<link>` que ele escreve (`ssr.nonce` do router), e os scripts
 * à mão do `<head>` o leem do router. `'strict-dynamic'` deixa o que um script
 * confiável carrega (chunks do Vite, Turnstile, PostHog, beacon da
 * Cloudflare); `https:` e `'unsafe-inline'` só valem em navegador sem CSP 3,
 * que ignora o nonce.
 *
 * Estilo segue com `'unsafe-inline'`: o SSR escreve `style="…"` nos
 * elementos, e nonce em `style-src` desligaria o `'unsafe-inline'`.
 * Imagem aceita qualquer `https:` (fotos antigas de bar podem morar fora do
 * `media.onside.sh`); o que leva dado para fora (`connect-src`) é a lista.
 *
 * Só HTML do SSR recebe esta política (`start.ts`). Arquivos de `public/`
 * não passam pelo Worker; o resto do que o Worker responde ganha só o
 * `frame-ancestors` (`hsts.ts`).
 */

/** 128 bits aleatórios em base64, um por resposta. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

function origin(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

export function contentSecurityPolicy(
  nonce: string,
  // Tiles do mapa: `tiles.onside.sh` em produção, o stub no E2E.
  tilesUrl?: string
): string {
  const connect = [
    "'self'",
    origin(tilesUrl) ?? 'https://tiles.onside.sh',
    // Upload de foto direto para o R2 (URL assinada, `upload-media.ts`).
    'https://*.r2.cloudflarestorage.com',
    // PostHog pelo proxy próprio (`VITE_POSTHOG_HOST`) e o painel dele.
    'https://a.onside.sh',
    'https://*.posthog.com',
    'https://challenges.cloudflare.com',
    'https://cloudflareinsights.com'
  ]
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    // MapLibre roda o worker de um arquivo próprio (`?worker&url`).
    "worker-src 'self' blob:",
    // Turnstile é um iframe; o resto é a própria origem (página do bar no
    // cadastro, a medalha da landing).
    "frame-src 'self' https://challenges.cloudflare.com",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; ')
}
