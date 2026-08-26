import { getAppConfig } from '@findsports_oficial/api/lib/app-config'
import {
  ehAberturaDeCheckout,
  respostaCheckoutIndisponivel
} from '@findsports_oficial/api/lib/billing-gate'
import {
  acaoDeEntrada,
  admitirConta,
  consultarEntrada,
  decidirEntrada,
  ehLoginEmail,
  emailDaRequisicao,
  respostaAdmissaoIndisponivel,
  respostaPortaoFechado
} from '@findsports_oficial/api/lib/waitlist-gate'
import { auth } from '@findsports_oficial/auth'
import { createFileRoute } from '@tanstack/react-router'

/**
 * ESC-19: dois portões antes do `better-auth`.
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

async function portaoDaWaitlist(request: Request): Promise<Response | null> {
  const acao = acaoDeEntrada(request.url)
  if (!acao) return null

  const portao = await getAppConfig('launch.waitlist_gate')
  const fechado = portao.signup
  if (!fechado) return null

  // O corpo só pode ser lido uma vez, e a requisição original ainda vai para
  // o `better-auth`. Por isso o clone.
  const email = await emailDaRequisicao(request.clone())
  // Sem e-mail legível não há o que decidir; o `better-auth` recusa sozinho
  // logo em seguida, com a mensagem de validação dele.
  if (!email) return null

  try {
    const { aprovado } = await consultarEntrada(email)
    const decisao = decidirEntrada({
      fechadoEmRuntime: portao.signup,
      aprovado
    })
    return decisao.permitido ? null : respostaPortaoFechado(decisao.motivo)
  } catch {
    console.error(JSON.stringify({ event: 'admission_check_failed_closed' }))
    return respostaAdmissaoIndisponivel()
  }
}

async function despachar(request: Request): Promise<Response> {
  if (ehAberturaDeCheckout(request.url)) {
    const liberado = await getAppConfig('billing.checkout_enabled')
    if (!liberado) return respostaCheckoutIndisponivel()
  }

  const acao = acaoDeEntrada(request.url)
  const loginEmail = ehLoginEmail(request.url)
  const email =
    acao || loginEmail ? await emailDaRequisicao(request.clone()) : null
  const barrado = await portaoDaWaitlist(request)
  if (barrado) return barrado

  const response = await auth.handler(request)
  if (acao === 'signup' && email && response.ok) {
    await admitirConta(email)
  }
  if (loginEmail && email && response.ok) {
    const portao = await getAppConfig('launch.waitlist_gate')
    if (!portao.signup) await admitirConta(email)
  }
  return response
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => despachar(request),
      POST: ({ request }) => despachar(request)
    }
  }
})
