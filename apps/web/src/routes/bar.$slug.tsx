import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { BarGone } from '@/components/bar-page/bar-gone'
import {
  BarPage,
  type BarPageSearch,
  type LiveBar
} from '@/components/bar-page/bar-page'
import {
  barJsonLd,
  barPageDescription,
  barPageTitle,
  barSocial
} from '@/components/bar-page/bar-page-model'
import { StructuredData } from '@/components/structured-data'
import { getPublicBar } from '@/functions/public-bar'
import { pageHead } from '@/lib/page-head'
import { SITE_URL } from '@/lib/site'

/**
 * A página pública do bar (decisão do dono, 05/11/2026): aberta sem login,
 * indexável com o bar no ar. O endereço é `/bar/<nome-e-bairro>-<8 hex do
 * id>` (`bar-slug.ts`): quem resolve é o prefixo, e nome desatualizado
 * redireciona com 301 para o atual. Bar fora do ar responde 200 com
 * `noindex`; link sem bar, 404.
 */
export const Route = createFileRoute('/bar/$slug')({
  validateSearch: (search: Record<string, unknown>): BarPageSearch => ({
    ...(typeof search.jogo === 'string' ? { jogo: search.jogo } : {}),
    ...(search.acao === 'vou' || search.acao === 'salvar'
      ? { acao: search.acao }
      : {})
  }),
  loader: async ({ params, location }) => {
    const page = await getPublicBar({ data: params.slug })
    if (!page) throw notFound()
    if (page.path !== `/bar/${params.slug}`) {
      throw redirect({
        href: `${page.path}${location.searchStr}`,
        statusCode: 301
      })
    }
    return page
  },
  head: ({ loaderData: page }) => {
    if (!page) return {}
    if (page.kind === 'off_air') {
      return pageHead({
        path: page.path,
        title: `${page.name} saiu do ar — Onside`,
        description: `${page.name} não está mostrando jogos na Onside agora.`,
        indexable: false
      })
    }
    const bar = page.bar as LiveBar
    const head = pageHead({
      path: page.path,
      title: barPageTitle(bar, page.now),
      description: barPageDescription(bar, page.now),
      indexable: !page.ownerPreview,
      social: barSocial(bar, page.now)
    })
    const image = bar.photoUrl
    return {
      ...head,
      meta: [
        ...head.meta,
        ...(image
          ? [
              { property: 'og:image', content: image },
              { name: 'twitter:image', content: image }
            ]
          : [])
      ]
    }
  },
  notFoundComponent: () => <BarGone invalid />,
  component: BarRoute
})

function BarRoute() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  if (page.kind === 'off_air') return <BarGone invalid={false} />
  const bar = page.bar as LiveBar
  return (
    <>
      {page.ownerPreview ? null : (
        <StructuredData
          data={barJsonLd(bar, `${SITE_URL}${page.path}`, page.now)}
        />
      )}
      <BarPage
        bar={bar}
        path={page.path}
        now={page.now}
        ownerPreview={page.ownerPreview}
        nearby={page.nearby}
        search={search}
      />
    </>
  )
}
