import { createFileRoute, notFound } from '@tanstack/react-router'
import { entradaHead } from '@/components/entrada/auth'
import { NoApp, SEM_BAR_HEAD } from '@/components/entrada/no-app'
import { getBarTeaser } from '@/functions/get-bar-teaser'

/**
 * O link de um bar (`/pub/$pubId`). O web é só para bares (decisão do dono,
 * 24/10/2026): a página do bar está no app, e aqui fica "O Bar do Zé está no
 * app" (design 4x–4z), com o cartão do bar, o QR e o "Abrir no app".
 *
 * Sem sessão, como sempre foi a prévia de link (WEB-312): o nome sai no HTML
 * do servidor para o título. Continua `noindex` e fora do sitemap
 * (`docs/seo.md`): é uma página de passagem para o app. Id que não existe é
 * 404 de verdade; bar fora do ar mostra a página sem o cartão (WEB-468), com
 * o título e o "Abrir no app" da página sem bar, e segue 200: o bar volta ao
 * ar quando contrata, e o link compartilhado continua levando ao app.
 */
export const Route = createFileRoute('/(pub)/pub/$pubId')({
  loader: async ({ params }) => {
    const teaser = await getBarTeaser({ data: params.pubId }).catch(() => null)
    if (teaser && !teaser.exists) throw notFound()
    return teaser?.bar ?? null
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.name
    return entradaHead({
      path: `/pub/${params.pubId}`,
      ...(name
        ? {
            title: `${name} — Onside`,
            description: `${name}: jogos, estrutura e preço médio na Onside.`
          }
        : SEM_BAR_HEAD),
      indexable: false
    })
  },
  component: PubPage
})

function PubPage() {
  const { pubId } = Route.useParams()
  return <NoApp bar={Route.useLoaderData()} barId={pubId} />
}
