import { createFileRoute } from '@tanstack/react-router'
import { TorcedorShell } from '@/components/torcedor/shell'

export const Route = createFileRoute('/(dashboard)/dashboard_/seus-bares')({
  head: () => ({
    meta: [{ title: 'Onside' }, { name: 'robots', content: 'noindex' }]
  }),
  component: () => (
    <TorcedorShell aba="seus-bares">
      <div className="page" />
    </TorcedorShell>
  )
})
