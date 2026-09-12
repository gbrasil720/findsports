import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Link } from '@tanstack/react-router'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'
import Fire from 'reicon-react/icons/Fire'
import Heart from 'reicon-react/icons/Heart'
import Location from 'reicon-react/icons/Location'
import Medal from 'reicon-react/icons/Medal'
import { formatProfileEventDate } from './profile-formatters'
import type {
  BarRecommendation,
  CompletionItem,
  FavoriteEvent,
  ProfileTab
} from './profile-model'
import { ProfileRecommendations } from './profile-recommendations'

type Props = {
  completionItems: CompletionItem[]
  completionScore: number
  favoritesCount: number
  preferencesCount: number
  loadingPreferences: boolean
  preferencesError: string | null
  preferencesRetryable: boolean
  onRetryPreferences: () => void
  radiusKm: number
  loadingFavorites: boolean
  favoritesError: string | null
  favoritesRetryable: boolean
  onRetryFavorites: () => void
  upcomingEvents: FavoriteEvent[]
  recommendations: BarRecommendation[]
  loadingRecommendations: boolean
  recommendationsError: boolean
  recommendationsRetryable: boolean
  dismissingRecommendation: boolean
  onRetryRecommendations: () => void
  onOpenRecommendation: (barId: string) => void
  onDismissRecommendation: (barId: string) => void
  onSelectTab: (tab: ProfileTab) => void
}

export function ProfileOverview({
  completionItems,
  completionScore,
  favoritesCount,
  preferencesCount,
  loadingPreferences,
  preferencesError,
  preferencesRetryable,
  onRetryPreferences,
  radiusKm,
  loadingFavorites,
  favoritesError,
  favoritesRetryable,
  onRetryFavorites,
  upcomingEvents,
  recommendations,
  loadingRecommendations,
  recommendationsError,
  recommendationsRetryable,
  dismissingRecommendation,
  onRetryRecommendations,
  onOpenRecommendation,
  onDismissRecommendation,
  onSelectTab
}: Props) {
  const completedItems = completionItems.filter((item) => item.done).length
  const stats = [
    {
      value: favoritesError ? '—' : String(favoritesCount),
      label: 'Favoritos',
      Icon: Heart,
      tab: 'Favoritos' as const
    },
    {
      value: `${radiusKm} km`,
      label: 'Raio de busca',
      Icon: Location,
      tab: 'Configurações' as const
    },
    {
      value: preferencesError ? '—' : String(preferencesCount),
      label: 'Esportes',
      Icon: Medal,
      tab: 'Configurações' as const
    }
  ]

  return (
    <div
      className="space-y-6"
      aria-busy={loadingFavorites || loadingPreferences || undefined}
    >
      {loadingFavorites || loadingPreferences ? (
        <span className="sr-only" role="status" aria-live="polite">
          {loadingFavorites
            ? 'Carregando favoritos e próximos jogos…'
            : 'Carregando seus esportes favoritos…'}
        </span>
      ) : null}
      {favoritesError || preferencesError ? (
        <div className="onside-callout onside-callout-danger" role="alert">
          {favoritesError ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">{favoritesError}</p>
              {favoritesRetryable ? (
                <button
                  type="button"
                  onClick={onRetryFavorites}
                  className="onside-btn onside-btn-outline min-h-11 shrink-0"
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : null}
          {preferencesError ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">{preferencesError}</p>
              {preferencesRetryable ? (
                <button
                  type="button"
                  onClick={onRetryPreferences}
                  className="onside-btn onside-btn-outline min-h-11 shrink-0"
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {completionScore < 100 ? (
        <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold text-sm">
              Perfil {completionScore}% configurado
            </p>
            <span className="text-[var(--onside-muted)] text-xs">
              {completedItems}/{completionItems.length}
            </span>
          </div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-none bg-[var(--onside-stone)]">
            <div
              className="h-full origin-left rounded-none bg-[var(--onside-acid)] transition-transform duration-[180ms] [transition-timing-function:var(--onside-ease-out)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${completionScore / 100})` }}
            />
          </div>
          <ul className="space-y-1.5">
            {completionItems.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-xs">
                <span
                  className={`grid size-4 place-items-center ${
                    item.done
                      ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                      : 'bg-[var(--onside-stone)] text-[var(--onside-muted)]'
                  }`}
                >
                  <Check size={10} color="currentColor" />
                </span>
                <span
                  className={
                    item.done
                      ? 'text-[var(--onside-ink)]'
                      : 'text-[var(--onside-muted)]'
                  }
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map(({ value, label, Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectTab(tab)}
            className="group rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5 text-left transition-[box-shadow] hover:shadow-sm hover:ring-[var(--onside-live)]/30"
          >
            <Icon
              size={20}
              color="currentColor"
              className="mb-3 text-[var(--onside-live-text)]"
              aria-hidden="true"
            />
            <div className="font-bold text-3xl">
              {loadingFavorites && label === 'Favoritos' ? (
                <Skeleton className="h-9 w-14" />
              ) : loadingPreferences && label === 'Esportes' ? (
                <Skeleton className="h-9 w-14" />
              ) : (
                value
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--onside-muted)] uppercase tracking-widest">
              {label}
              <ArrowRight
                size={12}
                color="currentColor"
                className="text-[var(--onside-muted)] transition-colors group-hover:text-[var(--onside-live-text)]"
              />
            </div>
          </button>
        ))}
      </div>

      {loadingFavorites ? (
        <UpcomingEventsSkeleton />
      ) : favoritesError ? null : upcomingEvents.length > 0 ? (
        <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-lg">
            <Fire
              size={18}
              color="currentColor"
              className="text-[var(--onside-live)]"
            />
            Próximos jogos nos seus bares
          </h2>
          <ul className="divide-y divide-[var(--onside-line)]">
            {upcomingEvents.map((event) => (
              <li key={`${event.bar.id}-${event.id}`}>
                <Link
                  to="/pub/$pubId"
                  params={{ pubId: event.bar.id }}
                  className="group flex items-center gap-3 py-3"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-none bg-[var(--onside-acid)]/10">
                    <Medal
                      size={16}
                      color="currentColor"
                      className="text-[var(--onside-live)]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-sm transition-colors group-hover:text-[var(--onside-live-text)]">
                      {event.participants.length > 0
                        ? event.participants
                            .map((participant) => participant.team.name)
                            .join(' × ')
                        : event.participantFreeText || event.championship}
                    </div>
                    <div className="truncate text-[var(--onside-muted)] text-xs">
                      {event.bar.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-[var(--onside-ink)] text-xs">
                      {formatProfileEventDate(event.startsAt)}
                    </div>
                    <div className="text-[10px] text-[var(--onside-muted)] uppercase tracking-wide">
                      {event.sport.name}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onSelectTab('Favoritos')}
            className="mt-2 flex items-center gap-1 font-bold text-[var(--onside-live-text)] text-xs hover:underline"
          >
            Ver todos os favoritos <ArrowRight size={12} color="currentColor" />
          </button>
        </section>
      ) : favoritesCount > 0 ? (
        <OverviewEmpty
          Icon={Fire}
          title="Sem jogos agendados nos seus bares"
          description="Seus bares favoritos não têm eventos próximos."
          action="Encontrar bar para hoje"
        />
      ) : (
        <OverviewEmpty
          Icon={Heart}
          title="Nenhum bar favoritado"
          description="Favorite bares para acompanhar os próximos jogos aqui."
          action="Explorar bares"
        />
      )}

      <ProfileRecommendations
        recommendations={recommendations}
        loading={loadingRecommendations}
        error={recommendationsError}
        retryable={recommendationsRetryable}
        dismissing={dismissingRecommendation}
        onRetry={onRetryRecommendations}
        onOpen={onOpenRecommendation}
        onDismiss={onDismissRecommendation}
      />
    </div>
  )
}

function UpcomingEventsSkeleton() {
  return (
    <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Fire
          size={18}
          color="currentColor"
          className="text-[var(--onside-live)]"
          aria-hidden="true"
        />
        <span className="font-bold text-lg">Próximos jogos nos seus bares</span>
      </div>
      <ul className="divide-y divide-[var(--onside-line)]">
        {[1, 2, 3].map((item) => (
          <li key={item} className="flex items-center gap-3 py-3">
            <Skeleton className="size-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 max-w-full" />
              <Skeleton className="h-3 w-1/2 max-w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OverviewEmpty({
  Icon,
  title,
  description,
  action
}: {
  Icon: typeof Fire
  title: string
  description: string
  action: string
}) {
  return (
    <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6 text-center">
      <Icon
        size={28}
        color="currentColor"
        className="mx-auto mb-2 text-[var(--onside-muted)]"
      />
      <p className="mb-1 font-bold text-[var(--onside-ink)] text-sm">{title}</p>
      <p className="mb-3 text-[var(--onside-muted)] text-xs">{description}</p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 font-bold text-[var(--onside-live-text)] text-xs hover:underline"
      >
        {action} <ArrowRight size={12} color="currentColor" />
      </Link>
    </section>
  )
}
