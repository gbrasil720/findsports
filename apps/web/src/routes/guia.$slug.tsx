import { createFileRoute, notFound } from '@tanstack/react-router'
import { findGuiaArticle } from '@/components/guia/guia-articles'
import { guiaArticleHead, guiaArticleJsonLd } from '@/components/guia/guia-head'
import { LegalPage } from '@/components/legal/legal-page'
import { StructuredData } from '@/components/structured-data'

export const Route = createFileRoute('/guia/$slug')({
  // Artigo que não existe é 404 de verdade, não página vazia.
  loader: ({ params }) => {
    const article = findGuiaArticle(params.slug)
    if (!article) throw notFound()
    return article.slug
  },
  head: ({ params }) => {
    const article = findGuiaArticle(params.slug)
    return article ? guiaArticleHead(article) : {}
  },
  component: GuiaArticlePage
})

function GuiaArticlePage() {
  const slug = Route.useLoaderData()
  const article = findGuiaArticle(slug)
  if (!article) return null
  return (
    <>
      <StructuredData data={guiaArticleJsonLd(article)} />
      <LegalPage document={article.document} closing={article.closing} />
    </>
  )
}
