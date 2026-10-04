/**
 * O workerd se identifica assim em `navigator.userAgent`; Node e Bun não.
 *
 * Decide de qual cabeçalho sai o IP do cliente (WEB-199). A Cloudflare anexa
 * ao `x-forwarded-for` o que o cliente mandou, e só o `cf-connecting-ip` é
 * dela. Fora do Worker (dev, testes, E2E) não há proxy e vale o
 * `x-forwarded-for`, que os testes usam para separar o rate limit por IP.
 */
export const isCloudflareWorkers =
  globalThis.navigator?.userAgent === 'Cloudflare-Workers'
