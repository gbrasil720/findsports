import type { SubscriptionPlan } from '@findsports_oficial/db'
import { Link } from '@tanstack/react-router'
import Heart from 'reicon-react/icons/Heart'
import Location from 'reicon-react/icons/Location'
import { useMinuteNow } from '@/components/app/minute-tick'
import type { DiscoveryCardBar } from '@/domain/dashboard-selectors'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { getPlan } from '@/lib/plan-catalog'

function formatStartsAt(startsAt: string | Date): string {
  return new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: undefined
  })
}

function formatDate(startsAt: string | Date): string {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}

function isNew(createdAt?: string): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000
}

function SportBadge({ name }: { slug: string; name: string }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center border border-[var(--bar-card-chip-bg)] bg-[var(--bar-card-chip-bg)] font-[family-name:var(--onside-mono)] text-[8px] font-bold text-[var(--bar-card-chip-fg)]"
      title={name}
    >
      {initials}
    </span>
  )
}

/**
 * Tratamento do cartão por plano.
 *
 * A distinção não depende de cor sozinha em nenhum degrau: o ícone vem do
 * próprio plano em `PLAN_CATALOG` (`Star` no Pro, `Trophy` no Elite), o nome
 * está escrito, e a forma do cartão muda — trilho no Pro, inversão no Elite.
 *
 * `starter` sem selo vem da §5 de `docs/public-bar-page-redesign.md`: capa
 * compacta, sem selo, nada escondido.
 */
const PLAN_CARD: Record<SubscriptionPlan, string | null> = {
  elite: 'onside-bar-card-elite',
  pro: 'onside-bar-card-pro',
  starter: null
}

/**
 * O selo continua existindo para nomear o plano — o cartão diz que é
 * diferente, o selo diz qual é. No Elite ele inverte junto, senão vira ink
 * sobre ink.
 */
const PLAN_BADGE: Record<SubscriptionPlan, string | null> = {
  elite: 'bg-[var(--onside-acid)] text-[var(--onside-ink)]',
  pro: 'border border-[var(--onside-ink)] text-[var(--onside-ink)]',
  starter: null
}

type Props = {
  bar: DiscoveryCardBar
  isHovered: boolean
  isFavorite: boolean
  favoritePending?: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  onFavorite: (barId: string) => void
}

export function BarCard({
  bar,
  isHovered,
  isFavorite,
  favoritePending = false,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onFavorite
}: Props) {
  const event = bar.nextEvent
  // ESC-17: só este cartão re-renderiza na virada do minuto, e não a página.
  const agora = useMinuteNow()
  const temporalState = event
    ? getEventTemporalState(event.startsAt, null, agora)
    : null
  const live = temporalState === 'live'
  const upcoming = temporalState === 'upcoming'
  const extraEvents = (bar.event_count ?? 0) - 1
  const newBar = isNew(bar.created_at)
  const plan = bar.plan
  const planCard = PLAN_CARD[plan]
  const planBadge = PLAN_BADGE[plan]
  const PlanIcon = getPlan(plan).icon
  const planName = getPlan(plan).name
  const participantsLabel =
    event && (event.participants.length > 0 || event.participantFreeText)
      ? event.participants.length > 0
        ? event.participants.map((p) => p.team.name).join(' × ')
        : (event.participantFreeText ?? '')
      : null

  const initials = bar.name
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className={`onside-bar-card group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-[1.5px] border-[var(--onside-ink)] bg-[var(--bar-card-bg)] p-4 text-[var(--bar-card-fg)] sm:gap-4 ${
        planCard ?? ''
      } ${isHovered ? 'shadow-[4px_4px_0_var(--bar-card-shadow)]' : ''}`}
    >
      <Link
        to="/pub/$pubId"
        params={{ pubId: bar.id }}
        onClick={() =>
          analytics.barOpened({
            bar_id: bar.id,
            source: 'card',
            bar_plan: plan
          })
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        className="col-span-2 grid min-w-0 grid-cols-[auto_1fr] items-center gap-3 outline-offset-2 sm:gap-4"
        aria-label={`Ver ${bar.name}`}
      >
        {/* Ao vivo é urgência e plano é hierarquia: canais separados. O avatar
            carrega só o estado, e o selo carrega só o plano — antes os dois
            disputavam o mesmo pixel e um bar Elite com jogo ao vivo perdia o
            sinal de plano. */}
        <div
          className={`grid size-16 shrink-0 place-items-center overflow-hidden font-bold text-xl ${
            live
              ? 'bg-[var(--onside-live)] text-[var(--onside-paper)]'
              : 'bg-[var(--bar-card-avatar-bg)] text-[var(--bar-card-avatar-fg)]'
          }`}
        >
          {bar.photo_url ? (
            <img
              src={bar.photo_url}
              alt=""
              width={64}
              height={64}
              className="size-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {event ? (
              live ? (
                <span className="inline-flex items-center gap-1 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--bar-card-live)] uppercase tracking-widest">
                  <span
                    className="onside-live-dot is-pulse"
                    aria-hidden="true"
                  />
                  Ao vivo
                </span>
              ) : upcoming ? (
                <span className="font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--bar-card-muted)] uppercase tracking-widest tabular-nums">
                  {formatDate(event.startsAt)} às{' '}
                  {formatStartsAt(event.startsAt)}
                </span>
              ) : null
            ) : (
              <span className="font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--bar-card-muted)] uppercase tracking-widest">
                Sem eventos programados
              </span>
            )}
            {planBadge ? (
              <span
                className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 font-[family-name:var(--onside-mono)] text-[9px] font-bold uppercase tracking-wider ${planBadge}`}
              >
                <PlanIcon size={9} color="currentColor" aria-hidden="true" />
                {planName}
              </span>
            ) : null}
            {newBar ? (
              <span className="onside-badge-acid onside-badge">Novo</span>
            ) : null}
          </div>

          <h3
            className="mb-1 truncate font-bold text-lg leading-tight"
            title={bar.name}
          >
            {bar.name}
          </h3>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 font-bold text-sm tabular-nums">
              <Location size={14} color="currentColor" aria-hidden="true" />
              {Number.isFinite(bar.distance_km)
                ? `${bar.distance_km.toFixed(1)} km`
                : '—'}
            </span>
            <span className="text-[var(--bar-card-muted)] text-xs">
              {bar.neighborhood}
            </span>
            {event ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--bar-card-muted)] text-xs">
                <SportBadge slug={event.sport.slug} name={event.sport.name} />
                <span className="truncate" title={event.championship}>
                  {event.championship}
                </span>
              </span>
            ) : null}
            {participantsLabel ? (
              <span
                className="truncate text-[var(--bar-card-muted)] text-xs"
                title={participantsLabel}
              >
                {participantsLabel}
              </span>
            ) : null}
            {extraEvents > 0 ? (
              <span className="onside-badge shrink-0 border-[var(--onside-ink)] bg-[var(--onside-stone)] text-[var(--onside-ink)]">
                +{extraEvents} {extraEvents === 1 ? 'jogo' : 'jogos'}
              </span>
            ) : null}
            {/* Vem `null` de bar sem amostra suficiente — o servidor já
                aplicou o piso, a tela não decide isso. */}
            {bar.rating ? (
              <span
                className="onside-badge shrink-0 border-[var(--onside-ink)] bg-[var(--onside-acid)] text-[var(--onside-ink)] tabular-nums"
                title={`${bar.rating.positive} de ${bar.rating.total} torcedores voltariam`}
              >
                {bar.rating.percentage}% voltariam
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <button
        type="button"
        disabled={favoritePending}
        aria-label={
          isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
        }
        aria-pressed={isFavorite}
        aria-busy={favoritePending || undefined}
        onClick={() => onFavorite(bar.id)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`col-start-3 row-start-1 grid min-h-11 min-w-11 shrink-0 place-self-start place-items-center border border-[var(--onside-ink)] transition-colors disabled:opacity-50 ${
          isFavorite
            ? 'bg-[var(--onside-live)] text-[var(--onside-paper)]'
            : 'bg-[var(--onside-paper)] text-[var(--onside-ink)] hover:bg-[var(--onside-stone)]'
        }`}
      >
        <Heart
          size={16}
          color="currentColor"
          weight={isFavorite ? 'Filled' : 'Outline'}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
