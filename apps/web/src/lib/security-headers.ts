/**
 * HSTS de dois anos, sem `includeSubDomains`. Arquivos estáticos recebem o mesmo valor por
 * `public/_headers`, que o Workers assets aplica antes do Worker rodar.
 */
export const HSTS = 'max-age=63072000'

/**
 * Nenhuma página do web abre dentro de iframe de outro site (clickjacking).
 * `'self'` mantém o iframe da própria página do bar no "Assim o torcedor vê"
 * do cadastro (`torcedor-ve.tsx`). `X-Frame-Options` é o mesmo para
 * navegador antigo.
 */
export const FRAME_ANCESTORS = "frame-ancestors 'self'"

/**
 * Headers fixos de toda resposta, também em `public/_headers` (o teste confere).
 * Permissions-Policy só nega o que o web não usa: a localização fica para o
 * Explorar, a página do bar e Bares pra você (inclusive no iframe da própria
 * origem); copiar e compartilhar não entram (o padrão já é `self`), nem o que
 * o Turnstile possa pedir.
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()'
} as const

/** Cópia da resposta com os headers de segurança: os da original podem ser imutáveis. */
export function withSecurityHeaders(response: Response): Response {
  const copy = new Response(response.body, response)
  copy.headers.set('Strict-Transport-Security', HSTS)
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    copy.headers.set(name, value)
  const csp = copy.headers.get('Content-Security-Policy')
  // CSP que já venha sem `frame-ancestors` ganha a diretiva, não a perde.
  if (!csp) copy.headers.set('Content-Security-Policy', FRAME_ANCESTORS)
  else if (!/(^|;)\s*frame-ancestors\b/i.test(csp))
    copy.headers.set(
      'Content-Security-Policy',
      `${csp.replace(/;\s*$/, '')}; ${FRAME_ANCESTORS}`
    )
  copy.headers.set('X-Frame-Options', 'SAMEORIGIN')
  return copy
}
