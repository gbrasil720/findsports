import { createFileRoute } from '@tanstack/react-router'
import { DesempenhoPage } from '@/components/painel/desempenho'

export const Route = createFileRoute('/admin/desempenho')({
  head: () => ({ meta: [{ title: 'Desempenho — Onside' }] }),
  component: DesempenhoPage
})
