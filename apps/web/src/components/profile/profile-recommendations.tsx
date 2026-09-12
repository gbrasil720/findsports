import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Link } from '@tanstack/react-router'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Compass from 'reicon-react/icons/Compass'
import Location from 'reicon-react/icons/Location'

import type { BarRecommendation } from './profile-model'

type Props = {
  recommendations: BarRecommendation[]
  loading: boolean
  error: boolean
  retryable: boolean
  dismissing: boolean
  onRetry: () => void
  onOpen: (barId: string) => void
  onDismiss: (barId: string) => void
}

export function ProfileRecommendations(props: Props) {
  return (
    <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-lg">
            <Compass
              size={18}
              color="currentColor"
              className="text-[var(--onside-live)]"
            />
            Sugestões para você
          </h2>
          <p className="mt-1 text-[var(--onside-muted)] text-xs">
            Baseadas nos seus esportes e nas experiências que você procura.
          </p>
        </div>
      </div>

      {props.loading ? (
        <div
          className="grid gap-3 sm:grid-cols-3"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Carregando sugestões…</span>
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex min-h-[190px] flex-col border border-[var(--onside-line)] bg-[var(--onside-stone)] p-4"
            >
              <Skeleton className="mb-2 h-4 w-3/4 max-w-full" />
              <Skeleton className="mb-4 h-3 w-1/2 max-w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-auto h-3 w-2/3" />
              <Skeleton className="mt-4 h-11 w-full" />
            </div>
          ))}
        </div>
      ) : null}

      {!props.loading && props.error ? (
        <div className="border border-[var(--onside-line)] bg-[var(--onside-stone)] p-5 text-center">
          <p className="mb-3 text-[var(--onside-muted)] text-sm" role="alert">
            Não foi possível carregar suas sugestões.
          </p>
          {props.retryable ? (
            <button
              type="button"
              onClick={props.onRetry}
              className="min-h-11 bg-[var(--onside-ink)] px-4 py-2 font-bold text-[var(--onside-paper)] text-xs"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {!props.loading && !props.error && props.recommendations.length === 0 ? (
        <div className="border border-[var(--onside-line)] bg-[var(--onside-stone)] p-5 text-center">
          <p className="font-bold text-sm">Novas sugestões em breve</p>
          <p className="mt-1 text-[var(--onside-muted)] text-xs">
            Ainda não há bares elegíveis perto de você.
          </p>
        </div>
      ) : null}

      {!props.loading && !props.error && props.recommendations.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {props.recommendations.map((recommendation) => (
            <article
              key={recommendation.bar.id}
              className="flex min-w-0 flex-col border border-[var(--onside-line)] bg-[var(--onside-stone)] p-4"
            >
              <Link
                to="/pub/$pubId"
                params={{ pubId: recommendation.bar.id }}
                onClick={() => props.onOpen(recommendation.bar.id)}
                className="group block flex-1"
              >
                <div className="mb-1 truncate font-bold text-sm transition-colors group-hover:text-[var(--onside-live-text)]">
                  {recommendation.bar.name}
                </div>
                <div className="mb-3 flex items-center gap-1 text-[var(--onside-muted)] text-xs">
                  <Location size={11} color="currentColor" aria-hidden="true" />
                  <span>
                    {recommendation.bar.neighborhood} ·{' '}
                    {formatDistance(recommendation.bar.distanceKm)}
                  </span>
                </div>
                <p className="text-[var(--onside-ink)] text-xs leading-relaxed">
                  {recommendation.reasonLabel}
                </p>
                {recommendation.isExpandedRadius ? (
                  <p className="mt-2 font-bold text-[10px] text-[var(--onside-live-text)] uppercase tracking-wide">
                    Um pouco além do seu raio ·{' '}
                    {formatDistance(recommendation.bar.distanceKm)}
                  </p>
                ) : null}
                <span className="mt-3 inline-flex items-center gap-1 font-bold text-[var(--onside-live-text)] text-xs">
                  Ver bar <ArrowRight size={12} color="currentColor" />
                </span>
              </Link>
              <button
                type="button"
                disabled={props.dismissing}
                onClick={() => props.onDismiss(recommendation.bar.id)}
                className="mt-4 min-h-11 border-[var(--onside-line)] border-t pt-3 text-left font-bold text-[var(--onside-muted)] text-[10px] uppercase tracking-wide hover:text-[var(--onside-ink)] disabled:opacity-50"
              >
                Não tenho interesse
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function formatDistance(distanceKm: number): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`
}
