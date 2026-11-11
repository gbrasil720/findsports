/**
 * O workerd se identifica assim em `navigator.userAgent`; Node e Bun não.
 *
 * Decide de qual cabeçalho sai o IP do cliente (WEB-199). A Cloudflare anexa
 * ao `x-forwarded-for` o que o cliente mandou, e só o `cf-connecting-ip` é
 * dela. Fora do Worker (dev, testes, E2E) não há proxy e vale o
 * `x-forwarded-for`, que os testes usam para separar o rate limit por IP.
 */
// O cast deixa o arquivo compilar também sem a lib DOM (o `tsconfig.worker`
// do web, que o alcança pelos jogos da semana na rotina do cron).
export const isCloudflareWorkers =
  (globalThis as { navigator?: { userAgent?: string } }).navigator
    ?.userAgent === 'Cloudflare-Workers'
