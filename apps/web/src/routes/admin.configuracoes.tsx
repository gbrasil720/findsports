import { createFileRoute } from '@tanstack/react-router'
import { ConfiguracoesPage } from '@/components/painel/configuracoes'

export const Route = createFileRoute('/admin/configuracoes')({
  head: () => ({ meta: [{ title: 'Configurações — Onside' }] }),
  component: ConfiguracoesPage
})
