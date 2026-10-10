import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Settings from 'reicon-react/icons/Settings'
import SliderH from 'reicon-react/icons/SliderH'
import Store from 'reicon-react/icons/Store'
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
    // Sem sessão, o guard da raiz (applyAuthGuards) já mandou para o /login.
    if (context.session?.user.role !== 'admin') {
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

      {/*
       * O `max-w-2xl` prendia os cartões em 42rem dentro de uma casca de
       * 1260px: metade da tela ficava vazia enquanto os cartões se
       * espremiam. Sem o teto, a grade ocupa a casca e ganha a terceira
       * coluna onde há espaço para ela.
       */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

        <Link
          to="/internal/attendance"
          className="onside-panel onside-shadow group flex flex-col gap-5 p-6 no-underline sm:p-8"
        >
          <div className="grid size-14 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
            <AlertCircle
              size={28}
              color="var(--onside-ink)"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="onside-display text-2xl tracking-tight">
              Comparecimento
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Bares em que o torcedor diz que foi e o bar repetidamente não
              registra o código.
            </p>
          </div>
          <span className="onside-kicker text-[var(--onside-ink)]">
            Acessar →
          </span>
        </Link>

        <Link
          to="/internal/bars"
          className="onside-panel onside-shadow group flex flex-col gap-5 p-6 no-underline sm:p-8"
        >
          <div className="grid size-14 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
            <Store size={28} color="var(--onside-ink)" aria-hidden="true" />
          </div>
          <div>
            <h2 className="onside-display text-2xl tracking-tight">
              Bares e Assinaturas
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Veja plano, situação da assinatura e publicação de cada bar, sem
              ir ao banco.
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
