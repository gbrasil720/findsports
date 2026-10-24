import { createFileRoute } from '@tanstack/react-router'
import { MeuEspaco } from '@/components/admin/meu-espaco'

export const Route = createFileRoute('/admin/meu-espaco')({
  head: () => ({ meta: [{ title: 'Meu espaço — Painel do Bar — Onside' }] }),
  component: MeuEspaco
})
