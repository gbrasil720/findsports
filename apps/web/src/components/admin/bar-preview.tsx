import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import Eye from 'reicon-react/icons/Eye'
import { OnsideMap } from '@/components/app/onside-map'
import { BarCard } from '@/components/dashboard/bar-card'
import {
  compareEventStartsAscending,
  getEventTemporalState
} from '@/domain/events'
import type {
  AdminBar,
  EventsState,
  PlanState,
  SubscriptionPlan
} from './admin-model'

type PreviewBar = Pick<
  AdminBar,
  | 'id'
  | 'name'
  | 'neighborhood'
  | 'city'
  | 'latitude'
  | 'longitude'
  | 'photoUrl'
>

type Props = {
  bar: PreviewBar
  eventsState: EventsState
  planState: PlanState
}

function getPlanAccent(plan: SubscriptionPlan): 'acid' | 'ink' {
  return plan === 'pro' || plan === 'elite' ? 'acid' : 'ink'
}

export function BarPreview({ bar, eventsState, planState }: Props) {
  const events = eventsState.status === 'ready' ? eventsState.events : null
  const plan = planState.status === 'ready' ? planState.plan : null
  const nextEvent = events
    ?.filter(
      (item) => getEventTemporalState(item.startsAt, item.endsAt) !== 'past'
    )
    .sort(compareEventStartsAscending)[0]

  const previewBar =
    events && plan
      ? {
          id: bar.id,
          name: bar.name,
          neighborhood: bar.neighborhood,
          city: bar.city,
          latitude: bar.latitude,
          longitude: bar.longitude,
          photo_url: bar.photoUrl,
          distance_km: 0,
          plan,
          event_count: events.length,
          nextEvent: nextEvent
            ? {
                id: nextEvent.id,
                championship: nextEvent.championship,
                startsAt: nextEvent.startsAt.toString(),
                sport: {
                  name: nextEvent.sport?.name ?? '',
                  slug: nextEvent.sport?.slug ?? ''
                },
                participants: nextEvent.participants.map((item) => ({
                  team: {
                    name: item.team.name,
                    logoUrl: item.team.logoUrl ?? null
                  }
                })),
                participantFreeText: nextEvent.participantFreeText,
                classic: null
              }
            : undefined
        }
      : null

  const lat = Number.parseFloat(bar.latitude)
  const lng = Number.parseFloat(bar.longitude)

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="onside-display flex items-center gap-2 text-2xl">
          <Eye
            size={20}
            color="currentColor"
            className="text-[var(--onside-ink)]"
            aria-hidden="true"
          />
          Como o torcedor vê
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="onside-panel p-4">
          <p className="onside-kicker mb-3">Card</p>
          {previewBar ? (
            <BarCard
              bar={previewBar}
              isHovered={false}
              isFavorite={false}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
              onFocus={() => {}}
              onBlur={() => {}}
              onFavorite={() => {}}
            />
          ) : eventsState.status === 'error' || planState.status === 'error' ? (
            <p className="py-8 text-center text-[var(--onside-muted)] text-sm">
              Preview indisponível.
            </p>
          ) : (
            <div
              className="grid min-h-[158px] grid-cols-[auto_1fr_auto] items-center gap-3 border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] p-4"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Carregando preview…</span>
              <Skeleton className="size-16 shrink-0" />
              <div className="col-span-1 min-w-0 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-40 max-w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="size-11 shrink-0" />
            </div>
          )}
        </div>

        <div className="onside-panel p-4">
          <p className="onside-kicker mb-3">Mapa</p>
          {plan ? (
            <div className="onside-map-frame relative h-[180px]">
              <OnsideMap
                bars={[
                  {
                    id: bar.id,
                    name: bar.name,
                    lat,
                    lng,
                    accent: getPlanAccent(plan)
                  }
                ]}
                center={{ lat, lng }}
              />
            </div>
          ) : (
            <div
              className="onside-map-frame relative h-[180px]"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">
                {planState.status === 'error'
                  ? 'Mapa indisponível.'
                  : 'Carregando plano…'}
              </span>
              {planState.status === 'error' ? (
                <div className="grid h-full place-items-center text-[var(--onside-muted)] text-sm">
                  Mapa indisponível.
                </div>
              ) : (
                <Skeleton className="size-full" />
              )}
            </div>
          )}
          {planState.status === 'loading' ? (
            <Skeleton className="mt-2 h-3 w-28" />
          ) : planState.status === 'ready' && plan === 'starter' ? (
            <p className="mt-2 text-[var(--onside-muted)] text-xs">
              Pin padrão · Faça upgrade para Pro e ganhe pin destacado no mapa.
            </p>
          ) : planState.status === 'ready' ? (
            <p className="mt-2 font-semibold text-[var(--onside-ink)] text-xs">
              ✓ Pin destacado ativo
            </p>
          ) : (
            <p className="mt-2 text-[var(--onside-live-text)] text-xs">
              Não foi possível verificar o plano.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
