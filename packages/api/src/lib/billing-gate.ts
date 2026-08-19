/**
 * Portão de abertura de checkout (ESC-19).
 *
 * O plugin do Dodo Payments é montado dentro do `better-auth`, que resolve as
 * suas rotas antes de qualquer coisa nossa rodar — e a configuração dele é
 * estática, decidida quando o módulo carrega. Não há onde encaixar uma flag
 * lida por requisição lá dentro.
 *
 * Então o portão fica onde a requisição entra: no handler que despacha para o
 * `better-auth`. Do lado do servidor, e não da tela, porque a tela é só uma
 * sugestão — quem chamar o endpoint direto passaria por cima dela.
 *
 * O que NÃO é bloqueado, e a razão de cada um:
 *
 *   - `webhooks`: assinatura que ativa é dinheiro real. Ignorar o aviso
 *     deixaria o banco mentindo sobre o que o cliente comprou, e o Dodo não
 *     reenvia para sempre.
 *   - `customer/portal` e as listagens: quem quer cancelar precisa conseguir
 *     cancelar. Sempre. Bloquear isso junto transformaria um interruptor
 *     operacional em armadilha para o cliente.
 *
 * Só a ABERTURA de cobrança nova passa por aqui.
 */

const CAMINHOS_DE_ABERTURA = [
  '/dodopayments/checkout',
  '/dodopayments/checkout-session'
]

export function ehAberturaDeCheckout(url: string): boolean {
  let caminho: string
  try {
    caminho = new URL(url).pathname
  } catch {
    // Não é URL absoluta: trata o que veio como caminho, sem a query.
    caminho = url.split('?')[0] ?? ''
  }

  const normalizado = caminho.toLowerCase().replace(/\/+$/, '')
  return CAMINHOS_DE_ABERTURA.some((alvo) => normalizado.endsWith(alvo))
}

/**
 * Resposta do portão fechado. 503 e não 403: a cobrança não está proibida
 * para este usuário, está indisponível para todos e volta sem ele fazer nada.
 */
export function respostaCheckoutIndisponivel(): Response {
  return new Response(
    JSON.stringify({
      message:
        'A contratação de planos está temporariamente indisponível. Tente novamente em instantes.',
      code: 'CHECKOUT_DISABLED'
    }),
    {
      status: 503,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    }
  )
}
