import Check from 'reicon-react/icons/Check'
import type { ProfileReadiness } from './admin-model'
import { getMetric } from './metric-glossary'
import { MetricHint } from './metric-hint'

type Props = {
  readiness: ProfileReadiness
  onCreateEvent?: () => void
  onManageProfile?: () => void
}

export function AnalyticsEmptyState({
  readiness,
  onCreateEvent,
  onManageProfile
}: Props) {
  const pendingChecks = readiness.checks.filter((c) => !c.done)

  return (
    <div className="onside-panel-acid p-6">
      <h3 className="onside-heading mb-4">
        {getMetric('profileReadiness').label}
        <MetricHint metric="profileReadiness" />
      </h3>

      {/* Checklist */}
      <ul className="mb-6 space-y-2">
        {readiness.checks.map((check) => (
          <li key={check.key} className="flex items-center gap-2 text-sm">
            {check.done ? (
              <Check size={16} color="var(--onside-ink)" aria-hidden="true" />
            ) : (
              <span
                className="size-4 rounded-sm border border-[var(--onside-line)]"
                aria-hidden="true"
              />
            )}
            <span
              className={
                check.done
                  ? 'text-[var(--onside-ink)]'
                  : 'text-[var(--onside-ink)] opacity-60'
              }
            >
              {check.label}
            </span>
          </li>
        ))}
      </ul>

      {/* Score */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-[var(--onside-ink)] opacity-70">Progresso</span>
          <span className="font-medium text-[var(--onside-ink)]">
            {readiness.score}/{readiness.total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--onside-paper)]">
          <div
            className="h-full bg-[var(--onside-ink)] transition-all"
            style={{
              width: `${(readiness.score / readiness.total) * 100}%`
            }}
          />
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap gap-3">
        {pendingChecks.length > 0 && onManageProfile && (
          <button
            type="button"
            onClick={onManageProfile}
            className="onside-btn onside-btn-ink"
          >
            Completar perfil
          </button>
        )}
        {onCreateEvent && (
          <button
            type="button"
            onClick={onCreateEvent}
            className="onside-btn onside-btn-outline"
          >
            Cadastrar primeiro jogo
          </button>
        )}
      </div>
    </div>
  )
}
