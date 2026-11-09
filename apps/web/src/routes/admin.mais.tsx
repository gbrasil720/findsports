import { createFileRoute } from '@tanstack/react-router'
import { PainelMais } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/mais')({
  head: () => ({ meta: [{ title: 'Mais — Onside' }] }),
  component: PainelMais
})
