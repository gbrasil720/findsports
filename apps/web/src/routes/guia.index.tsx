import { createFileRoute } from '@tanstack/react-router'
import { guiaIndexHead } from '@/components/guia/guia-head'
import { GuiaIndexPage } from '@/components/guia/guia-index-page'

export const Route = createFileRoute('/guia/')({
  head: guiaIndexHead,
  component: GuiaIndexPage
})
