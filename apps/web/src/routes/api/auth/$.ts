import { getAppConfig } from '@findsports_oficial/api/lib/app-config'
import {
  ehAberturaDeCheckout,
  respostaCheckoutIndisponivel
} from '@findsports_oficial/api/lib/billing-gate'
import { auth } from '@findsports_oficial/auth'
import { setFounderCouponSource } from '@findsports_oficial/auth/stripe-checkout'
import { createFileRoute } from '@tanstack/react-router'

/**
 * ESC-19: o portão da cobrança antes do `better-auth`.
 *
 * Os plugins do better-auth montam as rotas deles na carga do módulo, com
 * configuração estática — não há como consultar uma flag lá dentro por
 * requisição. E `packages/auth` não pode importar `packages/api`, onde a
 * configuração vive: a dependência corre no sentido oposto.
 *
 * Este handler é o único lugar que enxerga os dois lados, e é por onde a
 * requisição passa de qualquer forma — inclusive quando alguém bate no
 * endpoint sem passar pela tela. Do lado do servidor, e não da interface,
 * porque a interface é só uma sugestão.
 */

// Cupom de fundador do checkout (WEB-31). A chave mora em `packages/api` e o
// checkout em `packages/auth`, que não enxerga a configuração: é a mesma
// razão de este handler existir. Lida a cada checkout, como o portão.
setFounderCouponSource(async () => {
  const cupom = await getAppConfig('billing.founder_coupon')
  return cupom.enabled ? cupom.couponId : null
})

async function despachar(request: Request): Promise<Response> {
  if (ehAberturaDeCheckout(request.url)) {
    const liberado = await getAppConfig('billing.checkout_enabled')
    if (!liberado) return respostaCheckoutIndisponivel()
  }

  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => despachar(request),
      POST: ({ request }) => despachar(request)
    }
  }
})
