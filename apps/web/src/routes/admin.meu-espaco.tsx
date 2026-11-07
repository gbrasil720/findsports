import { createFileRoute } from '@tanstack/react-router'
import { MeuEspacoPage } from '@/components/painel/meu-espaco'

export const Route = createFileRoute('/admin/meu-espaco')({
  head: () => ({ meta: [{ title: 'Meu espaço — Onside' }] }),
  component: MeuEspacoPage
})
