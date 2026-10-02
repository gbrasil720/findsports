import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import type { AnalyticsEntitlementsData } from './admin-model'
import {
  type AnalyticsDateRange,
  type AnalyticsPeriodPreset,
  formatAnalyticsPeriod,
  getAvailableAnalyticsPeriods
} from './analytics-period'

export function AnalyticsPeriodSelector({
  entitlements,
  loadingEntitlements,
  entitlementsError,
  onRetryEntitlements,
  retryableEntitlements,
  range,
  preset,
  customRange,
  customError,
  isFetching,
  onPresetChange,
  onCustomRangeChange,
  onApplyCustom
}: {
  entitlements?: AnalyticsEntitlementsData
  loadingEntitlements: boolean
  entitlementsError: boolean
  onRetryEntitlements: () => void
  retryableEntitlements: boolean
  range: AnalyticsDateRange
  preset: AnalyticsPeriodPreset
  customRange: AnalyticsDateRange
  customError: string | null
  isFetching: boolean
  onPresetChange: (preset: AnalyticsPeriodPreset) => void
  onCustomRangeChange: (field: 'from' | 'to', value: string) => void
  onApplyCustom: () => void
}) {
  const availablePeriods = entitlements
    ? getAvailableAnalyticsPeriods(entitlements.maxDaysRetention)
    : []

  return (
    <section
      className="onside-panel-acid mb-6 p-4"
      aria-label="Período das analytics"
      aria-busy={loadingEntitlements || isFetching}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="onside-label mb-1 text-[var(--onside-ink)] opacity-70">
            Janela consultada
          </p>
          <p className="font-semibold text-[var(--onside-ink)] text-sm">
            {formatAnalyticsPeriod(range.from, range.to)}
          </p>
          <div className="mt-1 text-[var(--onside-ink)] text-xs opacity-60">
            {loadingEntitlements ? (
              <Skeleton className="h-3 w-36 bg-[var(--onside-ink)]/20" />
            ) : entitlements ? (
              entitlements.maxDaysRetention === null ? (
                'Seu plano permite todo o histórico disponível.'
              ) : (
                `Seu plano permite até ${entitlements.maxDaysRetention} dias.`
              )
            ) : (
              'Não foi possível verificar o limite do seu plano.'
            )}
          </div>
        </div>
        {isFetching && (
          <span className="text-[var(--onside-ink)] text-xs" role="status">
            Atualizando…
          </span>
        )}
      </div>

      {loadingEntitlements ? (
        <div className="mt-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando períodos disponíveis…</span>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-20 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-24 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-28 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-32 bg-[var(--onside-ink)]/20" />
          </div>
        </div>
      ) : entitlementsError ? (
        <div className="onside-callout onside-callout-danger mt-4" role="alert">
          <p className="flex-1 text-sm">
            Não foi possível carregar os períodos disponíveis.
          </p>
          {retryableEntitlements ? (
            <button
              type="button"
              onClick={onRetryEntitlements}
              className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <fieldset className="mt-4 border-0 p-0">
            <legend className="onside-label mb-2 text-[var(--onside-ink)] opacity-70">
              Atalho
            </legend>
            <div className="flex flex-wrap gap-2">
              {availablePeriods.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={preset === option.id}
                  onClick={() => onPresetChange(option.id)}
                  className={`onside-btn min-h-11 px-4 text-xs ${preset === option.id ? 'onside-btn-ink' : 'onside-btn-outline'}`}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={preset === 'custom'}
                onClick={() => onPresetChange('custom')}
                className={`onside-btn min-h-11 px-4 text-xs ${preset === 'custom' ? 'onside-btn-ink' : 'onside-btn-outline'}`}
              >
                Personalizado
              </button>
            </div>
          </fieldset>

          {preset === 'custom' && (
            <form
              method="post"
              className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                onApplyCustom()
              }}
            >
              <label className="block">
                <span className="onside-label mb-1.5 block">De</span>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(event) =>
                    onCustomRangeChange('from', event.target.value)
                  }
                  className="onside-input"
                  aria-label="Data inicial"
                />
              </label>
              <label className="block">
                <span className="onside-label mb-1.5 block">Até</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(event) =>
                    onCustomRangeChange('to', event.target.value)
                  }
                  className="onside-input"
                  aria-label="Data final"
                />
              </label>
              <button
                type="submit"
                className="onside-btn onside-btn-ink min-h-11"
              >
                Consultar período
              </button>
              {customError && (
                <p
                  className="text-[var(--onside-live-text)] text-xs sm:col-span-3"
                  role="alert"
                >
                  {customError}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  )
}
