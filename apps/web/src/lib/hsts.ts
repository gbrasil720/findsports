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

/** Cópia da resposta com HSTS e a trava de iframe: os headers da original podem ser imutáveis. */
export function withHsts(response: Response): Response {
  const copy = new Response(response.body, response)
  copy.headers.set('Strict-Transport-Security', HSTS)
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
