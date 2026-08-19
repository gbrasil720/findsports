import { getAppConfig } from '@findsports_oficial/api/lib/app-config'
import {
  ehAberturaDeCheckout,
  respostaCheckoutIndisponivel
} from '@findsports_oficial/api/lib/billing-gate'
import {
  acaoDeEntrada,
  consultarEntrada,
  decidirEntrada,
  emailDaRequisicao,
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
  // Desligado dos dois lados é o padrão. Sair antes evita ler o corpo e
  // consultar o banco no caminho de login por nada.
  if (!portao.signup && !portao.signin) return null

  // O corpo só pode ser lido uma vez, e a requisição original ainda vai para
  // o `better-auth`. Por isso o clone.
  const email = await emailDaRequisicao(request.clone())
  // Sem e-mail legível não há o que decidir; o `better-auth` recusa sozinho
  // logo em seguida, com a mensagem de validação dele.
  if (!email) return null

  const { aprovado, papelExistente } = await consultarEntrada(email)
  const decisao = decidirEntrada({ acao, portao, aprovado, papelExistente })
  return decisao.permitido ? null : respostaPortaoFechado(decisao.motivo)
}

async function despachar(request: Request): Promise<Response> {
  if (ehAberturaDeCheckout(request.url)) {
    const liberado = await getAppConfig('billing.checkout_enabled')
    if (!liberado) return respostaCheckoutIndisponivel()
  }

  const barrado = await portaoDaWaitlist(request)
  if (barrado) return barrado

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
