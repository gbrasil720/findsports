/**
 * Carregado no processo do `vite dev` da suíte (`NODE_OPTIONS=--import`, ver
 * `playwright.config.ts`): manda para o stub toda chamada do servidor à API
 * da Dodo.
 *
 * Por que no `fetch`, e não um `baseURL` no `dodoClient`: a sessão de checkout
 * não usa o nosso cliente. O `@dodopayments/core` monta um `DodoPayments`
 * próprio com `environment` fixo, e com `DODO_PAYMENTS_BASE_URL` no ambiente
 * esse construtor lança "Ambiguous URL". Aqui pegamos os dois clientes sem
 * tocar no código do app.
 */
const target = process.env.E2E_DODO_API_URL
const DODO_ORIGIN = /^https:\/\/(?:live|test)\.dodopayments\.com/

if (target) {
  const realFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const origin = DODO_ORIGIN.exec(url)?.[0]
    if (!origin) return realFetch(input, init)
    const stubbed = target + url.slice(origin.length)
    return input instanceof Request
      ? realFetch(new Request(stubbed, input), init)
      : realFetch(stubbed, init)
  }
}
