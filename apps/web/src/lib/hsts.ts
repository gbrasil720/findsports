/**
 * HSTS como a Vercel mandava. Arquivos estáticos recebem o mesmo valor por
 * `public/_headers`, que o Workers assets aplica antes do Worker rodar.
 */
export const HSTS = 'max-age=63072000'

/** Cópia da resposta com HSTS: os headers da original podem ser imutáveis. */
export function withHsts(response: Response): Response {
  const copy = new Response(response.body, response)
  copy.headers.set('Strict-Transport-Security', HSTS)
  return copy
}
