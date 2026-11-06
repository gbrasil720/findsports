import { createFileRoute } from '@tanstack/react-router'
import { AccountSettings } from '@/components/account/account-settings'
import { AdminTabPanel } from '@/components/admin/admin-tabs'
import { PainelPage } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/configuracoes')({
  head: () => ({ meta: [{ title: 'Configurações — Onside' }] }),
  component: ConfiguracoesPage
})

function ConfiguracoesPage() {
  return (
    <PainelPage title="Configurações">
      <AdminTabPanel id="admin-configuracoes">
        <div className="mb-6">
          <h2 className="onside-display text-2xl">Configurações</h2>
          <p className="mt-1 text-sm text-[var(--onside-muted)]">
            Gerencie a segurança da conta responsável por este bar.
          </p>
        </div>
        <AccountSettings surface="pub" />
      </AdminTabPanel>
    </PainelPage>
  )
}
