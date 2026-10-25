import { createFileRoute } from '@tanstack/react-router'
import { Desempenho } from '@/components/admin/desempenho'

export const Route = createFileRoute('/admin/desempenho')({
  head: () => ({
    meta: [{ title: 'Desempenho — Painel do Bar — Onside' }]
  }),
  component: Desempenho
})
