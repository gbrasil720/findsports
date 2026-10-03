/**
 * O workerd se identifica assim em `navigator.userAgent`; Node e Bun não.
 *
 * Decide de qual cabeçalho sai o IP do cliente (WEB-199). A Vercel sobrescreve
 * o `x-forwarded-for`; a Cloudflare anexa ao que o cliente mandou, e só o
 * `cf-connecting-ip` é dela. Na Vercel, o contrário: `cf-connecting-ip` vem do
 * cliente e não pode ser lido primeiro.
 */
export const isCloudflareWorkers =
  globalThis.navigator?.userAgent === 'Cloudflare-Workers'
