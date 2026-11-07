import { createFileRoute } from '@tanstack/react-router'
import { TorcedorShell } from '@/components/torcedor/shell'

export const Route = createFileRoute('/(dashboard)/dashboard_/pra-voce')({
  head: () => ({
    meta: [{ title: 'Onside' }, { name: 'robots', content: 'noindex' }]
  }),
  component: () => (
    <TorcedorShell aba="pra-voce">
      <div className="page" />
    </TorcedorShell>
  )
})
