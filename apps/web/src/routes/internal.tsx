import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import Settings from 'reicon-react/icons/Settings'
import SliderH from 'reicon-react/icons/SliderH'
import Users from 'reicon-react/icons/Users'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'

export const Route = createFileRoute('/internal')({
  head: () => ({
    meta: [
      { title: 'Admin Hall — Onside' },
      {
        name: 'description',
        content: 'Painel administrativo interno Onside.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: InternalHallPage
})

function InternalHallPage() {
  return (
    <InternalShell title="Admin Hall" backTo="/" backLabel="Início">
      <p className="mb-8 max-w-xl text-sm text-[var(--onside-muted)]">
        Escolha uma área para gerenciar.
      </p>

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/internal/waitlist"
          className="onside-panel onside-shadow group flex flex-col gap-5 p-6 no-underline sm:p-8"
        >
          <div className="grid size-14 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-acid)]">
            <Users size={28} color="var(--onside-ink)" aria-hidden="true" />
          </div>
          <div>
            <h2 className="onside-display text-2xl tracking-tight">
              Lista de Espera
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Visualize e exporte os inscritos na lista de espera — torcedores e
              bares.
            </p>
          </div>
          <span className="onside-kicker text-[var(--onside-ink)]">
            Acessar →
          </span>
        </Link>

        <Link
          to="/internal/manage-users"
          className="onside-panel onside-shadow group flex flex-col gap-5 p-6 no-underline sm:p-8"
        >
          <div className="grid size-14 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-ink)]">
            <Settings
              size={28}
              color="var(--onside-paper)"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="onside-display text-2xl tracking-tight">
              Gerenciar Usuários
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Impersone, bana, desbane e altere roles de usuários da plataforma.
            </p>
          </div>
          <span className="onside-kicker text-[var(--onside-ink)]">
            Acessar →
          </span>
        </Link>

        <Link
          to="/internal/flags"
          className="onside-panel onside-shadow group flex flex-col gap-5 p-6 no-underline sm:p-8"
        >
          <div className="grid size-14 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
            <SliderH size={28} color="var(--onside-ink)" aria-hidden="true" />
          </div>
          <div>
            <h2 className="onside-display text-2xl tracking-tight">
              Configuração
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Desligue caminhos de código, ajuste limites e libere cobrança sem
              deploy.
            </p>
          </div>
          <span className="onside-kicker text-[var(--onside-ink)]">
            Acessar →
          </span>
        </Link>
      </div>
    </InternalShell>
  )
}
