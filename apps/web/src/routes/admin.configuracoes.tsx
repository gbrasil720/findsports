import { createFileRoute } from '@tanstack/react-router'
import { Configuracoes } from '@/components/account/configuracoes'

export const Route = createFileRoute('/admin/configuracoes')({
  head: () => ({
    meta: [{ title: 'Configurações — Painel do Bar — Onside' }]
  }),
  component: Configuracoes
})
