import { Link } from '@tanstack/react-router'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import { SUPPORT_INBOX, SUPPORT_SLA_PENDING } from '@/lib/support-sla'

export function SupportSla() {
  return (
    <section
      className="onside-panel p-5 sm:p-6"
      aria-labelledby="support-sla-title"
    >
      <div className="mb-4 flex items-start gap-3">
        <CircleInfo
          size={20}
          color="currentColor"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div>
          <p className="onside-kicker text-[var(--onside-ink)]">
            SLA de suporte
          </p>
          <h2 id="support-sla-title" className="onside-display mt-1 text-2xl">
            Prioridade publicada. Prazo em confirmação.
          </h2>
        </div>
      </div>

      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-[var(--onside-muted)]">
        A fila já diferencia Starter, Pro e Elite no servidor. Os números
        comerciais ainda precisam de confirmação antes de serem apresentados
        como definitivos.
      </p>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="border border-[var(--onside-line)] p-3">
          <dt className="onside-kicker text-[var(--onside-muted)]">
            Primeira resposta
          </dt>
          <dd className="mt-2 font-bold text-sm">{SUPPORT_SLA_PENDING}</dd>
        </div>
        <div className="border border-[var(--onside-line)] p-3">
          <dt className="onside-kicker text-[var(--onside-muted)]">
            Horário de atendimento
          </dt>
          <dd className="mt-2 font-bold text-sm">{SUPPORT_SLA_PENDING}</dd>
        </div>
        <div className="border border-[var(--onside-line)] p-3">
          <dt className="onside-kicker text-[var(--onside-muted)]">
            Escalonamento
          </dt>
          <dd className="mt-2 font-bold text-sm">{SUPPORT_SLA_PENDING}</dd>
        </div>
      </dl>

      <p className="mt-5 text-xs leading-relaxed text-[var(--onside-muted)]">
        Fallback enquanto os prazos são confirmados:{' '}
        <a
          href={`mailto:${SUPPORT_INBOX}`}
          className="font-bold text-[var(--onside-ink)] underline"
        >
          {SUPPORT_INBOX}
        </a>
        . Veja também a{' '}
        <Link
          to="/support"
          className="font-bold text-[var(--onside-ink)] underline"
        >
          página de suporte
        </Link>
        .
      </p>
    </section>
  )
}
