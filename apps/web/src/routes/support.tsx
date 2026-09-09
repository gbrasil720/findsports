import { createFileRoute, Link } from '@tanstack/react-router'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { AppShell } from '@/components/app/app-shell'
import { SupportSla } from '@/components/support/support-sla'
import { SUPPORT_INBOX } from '@/lib/support-sla'

export const Route = createFileRoute('/support')({
  head: () => ({
    meta: [
      { title: 'Suporte e SLA — Onside' },
      {
        name: 'description',
        content: 'Canal de suporte, prioridade e SLA publicados pela Onside.'
      },
      { name: 'robots', content: 'index, follow' }
    ]
  }),
  component: SupportPage
})

function SupportPage() {
  return (
    <AppShell variant="public">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 border-[var(--onside-ink)] border-b pb-5">
          <p className="onside-kicker mb-2">Atendimento Onside</p>
          <h1 className="onside-display text-4xl md:text-5xl">
            Suporte com caminho claro.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--onside-muted)]">
            Bares com conta usam o formulário autenticado. Quem ainda não tem
            conta pode falar com a equipe pelo endereço público.
          </p>
        </header>

        <SupportSla />

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="onside-panel p-5">
            <p className="onside-kicker mb-2">Bar com conta</p>
            <h2 className="onside-display text-2xl">Abra uma solicitação.</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              O plano do bar é identificado no servidor e a fila aplica a
              prioridade vigente.
            </p>
            <Link
              to="/admin/support"
              className="onside-btn onside-btn-ink mt-5 min-h-11 text-xs"
            >
              Abrir suporte autenticado
              <ArrowRight size={14} color="currentColor" aria-hidden="true" />
            </Link>
          </div>

          <div className="onside-panel p-5">
            <p className="onside-kicker mb-2">Fallback público</p>
            <h2 className="onside-display text-2xl">Ainda sem conta?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--onside-muted)]">
              Use o mesmo contato público da landing enquanto o canal
              autenticado não se aplica.
            </p>
            <a
              href={`mailto:${SUPPORT_INBOX}`}
              className="onside-btn onside-btn-outline mt-5 min-h-11 text-xs"
            >
              {SUPPORT_INBOX}
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
