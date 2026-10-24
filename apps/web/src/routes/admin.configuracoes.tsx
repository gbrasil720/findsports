import { createFileRoute } from '@tanstack/react-router'
import { AccountSettings } from '@/components/account/account-settings'
import { AdminTabPanel } from '@/components/admin/admin-tabs'
import { CabecalhoPagina } from '@/components/painel'

export const Route = createFileRoute('/admin/configuracoes')({
  head: () => ({
    meta: [{ title: 'Configurações — Painel do Bar — Onside' }]
  }),
  component: ConfiguracoesPage
})

// Por enquanto, as configurações de antes dentro do shell novo.
function ConfiguracoesPage() {
  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="painel-legado">
        <AdminTabPanel id="admin-configuracoes" active>
          <p className="mb-6 text-sm text-[var(--onside-muted)]">
            Gerencie a segurança da conta responsável por este bar.
          </p>
          <AccountSettings surface="pub" />
        </AdminTabPanel>
      </div>
    </>
  )
}
