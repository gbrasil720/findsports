import { createFileRoute } from '@tanstack/react-router'
import { TorcedorShell } from '@/components/torcedor/shell'

export const Route = createFileRoute('/(dashboard)/dashboard_/codigo/$eventId')(
  {
    head: () => ({
      meta: [
        { title: 'Seu código — Onside' },
        { name: 'robots', content: 'noindex' }
      ]
    }),
    component: () => (
      <TorcedorShell aba="meus-jogos">
        <div className="page" />
      </TorcedorShell>
    )
  }
)
