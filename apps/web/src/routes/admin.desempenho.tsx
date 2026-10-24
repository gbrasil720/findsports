import { createFileRoute } from '@tanstack/react-router'
import { Desempenho } from '@/components/admin/desempenho'
import desempenhoCss from '@/components/admin/desempenho.css?url'

export const Route = createFileRoute('/admin/desempenho')({
  head: () => ({
    meta: [{ title: 'Desempenho — Painel do Bar — Onside' }],
    links: [{ rel: 'stylesheet', href: desempenhoCss }]
  }),
  component: Desempenho
})
