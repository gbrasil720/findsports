import { createFileRoute } from '@tanstack/react-router'
import { TorcedorShell } from '@/components/torcedor/shell'

export const Route = createFileRoute('/(dashboard)/dashboard_/preferencias')({
  head: () => ({
    meta: [{ title: 'Onside' }, { name: 'robots', content: 'noindex' }]
  }),
  component: () => (
    <TorcedorShell aba="preferencias">
      <div className="page" />
    </TorcedorShell>
  )
})
