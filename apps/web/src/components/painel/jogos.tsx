import type { EventNumbers } from '@findsports_oficial/api/lib/event-numbers'
import { ARRIVAL_UNDO_WINDOW_MS } from '@findsports_oficial/db/reservation-code'
import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AdminEvent, PolicyState } from '@/components/admin/admin-model'
import {
  useMyBar,
  useMyEventCreationPolicy,
  useMyEvents
} from '@/components/admin/admin-queries'
import { EventDeleteDialog } from '@/components/admin/event-delete-dialog'
import {
  getCreateBlockReason,
  getDeleteErrorMessage
} from '@/components/admin/events-manager'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Add,
  Arrow,
  Beer,
  Check,
  Close,
  People,
  Ranking,
  Search,
  Share,
  Sound,
  Sparkle,
  Tv
} from '@/components/landing/v3/icons'
import { getLapsedPaidPlan } from '@/lib/lapsed-plan'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { Avisos, usePlanStatus } from './avisos'
import {
  AVATAR_COLORS,
  barScreen,
  type GoingGame,
  gameOffer,
  gameScreen,
  goingCount,
  interestLabel,
  isDraft,
  useEventAnalytics,
  useEventNumbers,
  useGoing,
  useInterest
} from './dados'
import { faixaDoJogo } from './faixa-do-jogo'
import {
  brasiliaDay,
  brasiliaTime,
  dayLabel,
  eventState,
  eventTitle,
  inLabel,
  matchesSearch,
  relativeDayLabel,
  shiftDay,
  weekDays,
  weekdayShort
} from './noite'
import { NovoJogo, type NovoJogoMode } from './novo-jogo'
import { Interruptor, initials, usePainel } from './painel-shell'
import { Desfazer } from './quem-vai'
import { SemanaPraVoce } from './semana-pra-voce'
import { SugestoesDeJogo } from './sugestoes-de-jogo'

/*
 * Jogos (WEB-501, fase 2; protótipo `jogos`, `detail`): Próximos,
 * Rascunhos (WEB-436) e Passados, busca, lista por dia ou semana (domingo a
 * sábado) e o jogo aberto à direita, ou numa folha abaixo de 1100 px. O jogo
 * aberto liga e desliga na hora telão, som (WEB-399), a lista de quem vai
 * (WEB-437) e a oferta do jogo (WEB-422), e publica o rascunho.
 * "Como cada jogo foi" e "Comparar jogos" moram em Desempenho; Passados
 * leva para lá.
 */

const WIDE = '(min-width: 1101px)'
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  )
}

type Tab = 'prox' | 'rasc' | 'pass'

export function JogosPage({
  initialId,
  passados = false
}: {
  initialId?: string
  /** `?passados=1`: abre em Passados (o link de Desempenho). */
  passados?: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const now = useMinuteNow()
  const wide = useWide()
  const { analyticsRange, showsGoing, elite } = usePainel()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const policy = useMyEventCreationPolicy()
  const plan = usePlanStatus()
  const going = useGoing()
  const interest = useInterest()
  const eventNumbers = useEventNumbers()

  const all = events.data ?? []
  const initial = all.find((event) => event.id === initialId)
  const [tab, setTab] = useState<Tab>(() =>
    initial && isDraft(initial)
      ? 'rasc'
      : passados || (initial && eventState(initial, now) === 'past')
        ? 'pass'
        : 'prox'
  )
  const [mode, setMode] = useState<'lista' | 'semana'>('lista')
  const [query, setQuery] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(initialId ?? null)
  const [sheet, setSheet] = useState<NovoJogoMode | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const analytics = useEventAnalytics(analyticsRange, all)
  // Jogo passado aberto por link (`?jogo=`) antes de a grade carregar.
  const initialTab: Tab | null = !initial
    ? null
    : isDraft(initial)
      ? 'rasc'
      : eventState(initial, now) === 'past'
        ? 'pass'
        : null
  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  const published = all.filter((event) => !isDraft(event))
  const upcoming = published
    .filter((event) => eventState(event, now) !== 'past')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const past = published
    .filter((event) => eventState(event, now) === 'past')
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  // Rascunho (WEB-436): só aqui, fora de Próximos e de Passados.
  const drafts = all
    .filter(isDraft)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const list = (
    tab === 'prox' ? upcoming : tab === 'rasc' ? drafts : past
  ).filter((event) => matchesSearch(event, query))
  const goingById = new Map((going.data ?? []).map((g) => [g.id, g]))
  const today = brasiliaDay(now)
  const week = weekDays(today)

  // Bloqueio do "Novo jogo" com o texto da grade antiga (WEB-331, WEB-353).
  const policyState: PolicyState = policy.isLoading
    ? { status: 'loading' }
    : policy.isError || !policy.data
      ? {
          status: 'error',
          retryable: isRetryableError(policy.error),
          retry: () => void policy.refetch()
        }
      : { status: 'ready', policy: policy.data }
  const lapsedPlan = getLapsedPaidPlan(plan.subscription)
  const blockReason = getCreateBlockReason(policyState, lapsedPlan?.title)
  const canCreate = blockReason === null

  // Sem o catálogo da semana, a lista de sempre (bares perto).
  const sugestoesAntigas = (
    <SugestoesDeJogo
      className="pn-card pn-sgj"
      alvo="jogos-sugestoes"
      disabled={!canCreate}
      title={
        <div className="pn-chd">
          <h3>
            <Sparkle size={20} />
            Jogos que outros bares perto já marcaram
          </h3>
          <small>nos próximos 7 dias</small>
        </div>
      }
      hint={
        <p className="pn-note">
          Um toque publica, com o telão e o som do bar.{' '}
          {policy.data?.status === 'limited'
            ? `Cada um conta nos ${policy.data.limit} jogos do mês.`
            : 'Dá para editar depois.'}
        </p>
      }
    />
  )

  const subtitle = (() => {
    const name = plan.shownPlan?.name
    if (!policy.data || !name) return null
    if (policy.data.status === 'inactive') return `${name} · bar fora do ar`
    const inWeek = upcoming.filter((event) =>
      week.includes(brasiliaDay(event.startsAt))
    ).length
    const weekText = `${inWeek} ${inWeek === 1 ? 'publicado' : 'publicados'} na semana`
    if (policy.data.status === 'limited') {
      return `${name} · ${policy.data.used} de ${policy.data.limit} jogos usados · ${weekText}`
    }
    return `${name} · jogos ilimitados · ${weekText}`
  })()

  const del = useMutation(
    trpc.pub.deleteEvent.mutationOptions({
      onSuccess: () => {
        setDeletingId(null)
        setSelected(null)
        return Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEvents.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMe.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.pathKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
          })
        ])
      },
      // Recusa quer dizer que a grade está velha: recarregada, o diálogo
      // passa a explicar o bloqueio.
      onError: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.pub.getMyEvents.queryKey()
        })
    })
  )
  const deleting = deletingId ? all.find((e) => e.id === deletingId) : null

  // O jogo aberto grava na hora: telão, som, lista, oferta e publicar.
  const patch = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEvents.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.pathKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.barReservations.going.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
          })
        ])
    })
  )

  const open = (id: string) => setSelected(id)
  // No computador o jogo aberto é o escolhido, senão o primeiro da lista.
  const shown =
    all.find((event) => event.id === selected) ??
    (wide && mode === 'lista' ? list[0] : undefined)

  const detail = shown ? (
    <Detalhe
      event={shown}
      now={now}
      bar={bar}
      elite={elite}
      showsGoing={showsGoing}
      game={goingById.get(shown.id)}
      row={analytics.byEvent.get(shown.id)}
      interest={interest.ratio.get(shown.id)}
      canCreate={canCreate}
      saving={patch.isPending && patch.variables?.eventId === shown.id}
      patchError={
        patch.error && patch.variables?.eventId === shown.id
          ? getUserFacingMessage(
              patch.error,
              'Não foi possível salvar. Tente novamente.'
            )
          : null
      }
      onPatch={(changes) => {
        patch.reset()
        patch.mutate(
          { eventId: shown.id, ...changes },
          {
            // Publicado sai de Rascunhos: a lista segue o jogo.
            onSuccess: () => {
              if (changes.publish) setTab('prox')
            }
          }
        )
      }}
      onEdit={() => setSheet({ kind: 'edit', event: shown })}
      onDuplicate={() => setSheet({ kind: 'duplicate', event: shown })}
      onDelete={() => {
        del.reset()
        setDeletingId(shown.id)
        // As contagens do diálogo vêm da grade: lê de novo.
        void queryClient.invalidateQueries({
          queryKey: trpc.pub.getMyEvents.queryKey()
        })
      }}
    />
  ) : null

  return (
    <>
      <header className="pn-head">
        <div>
          <h1 className="pn-disp">Jogos</h1>
          {subtitle ? <p className="pn-sub">{subtitle}</p> : null}
        </div>
        <div className="pn-acts pn-new">
          <button
            type="button"
            className="pn-btn pn-ink pn-sm"
            disabled={!canCreate}
            title={blockReason ?? undefined}
            onClick={() => setSheet({ kind: 'new' })}
          >
            <Add size={18} />
            Novo jogo
          </button>
          {blockReason ? (
            <p
              className="pn-block"
              role={policyState.status === 'error' ? 'alert' : undefined}
            >
              {blockReason}{' '}
              {policyState.status === 'ready' &&
              policyState.policy.status === 'limited' ? (
                lapsedPlan ? (
                  <Link to="/admin/billing" className="pn-lnk">
                    Regularizar assinatura
                  </Link>
                ) : (
                  <a href="/plan" className="pn-lnk">
                    Fazer upgrade
                  </a>
                )
              ) : null}
              {policyState.status === 'error' && policyState.retryable ? (
                <button
                  type="button"
                  className="pn-lnk pn-lnk-b"
                  onClick={policyState.retry}
                >
                  Tentar novamente
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <Avisos only="limit" />

      <div className="pn-jbar">
        <div className="pn-tabs" role="tablist" aria-label="Jogos">
          {(
            [
              ['prox', 'Próximos', upcoming.length],
              ['rasc', 'Rascunhos', drafts.length],
              ['pass', 'Passados', past.length]
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id)
                setSelected(null)
              }}
            >
              {label}
              <span className="pn-n">{count}</span>
            </button>
          ))}
        </div>
        <div className="pn-jbar-r">
          <label className="pn-q">
            <Search size={18} />
            <span className="sr-only">Buscar jogo ou time</span>
            <input
              type="text"
              inputMode="search"
              placeholder="Buscar jogo ou time"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {tab === 'prox' ? (
            <fieldset className="pn-tabs" aria-label="Ver como">
              {(
                [
                  ['lista', 'Lista'],
                  ['semana', 'Semana']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>
      </div>

      {events.isLoading ? (
        <div className="pn-skel pn-rows-skel" role="status" aria-busy="true">
          <span className="sr-only">Carregando sua grade…</span>
          <i />
          <i />
          <i />
        </div>
      ) : events.isError ? (
        <div className="pn-aviso is-error" role="alert">
          <div className="pn-aviso-t">
            <b>Não foi possível carregar a grade.</b>
          </div>
          {isRetryableError(events.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void events.refetch()}
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : tab === 'prox' && mode === 'semana' ? (
        <Semana
          days={weekDays(today, weekOffset)}
          today={today}
          events={all.filter((event) => matchesSearch(event, query))}
          // O rascunho aparece tracejado na semana (WEB-436).
          offset={weekOffset}
          onOffset={setWeekOffset}
          canCreate={canCreate}
          onOpen={(id) => {
            open(id)
            if (wide) setMode('lista')
          }}
          onNew={(day) => setSheet({ kind: 'new', day })}
        />
      ) : (
        <div className="pn-jl">
          <div data-passeio="jogos">
            {tab === 'prox' && bar ? (
              <SemanaPraVoce
                variant="jogos"
                bar={bar}
                disabled={!canCreate}
                onEditar={open}
                limitNote={
                  policy.data?.status === 'limited'
                    ? `Um toque publica, com o telão e o som do bar. Cada um conta nos ${policy.data.limit} jogos do mês.`
                    : undefined
                }
                fallback={sugestoesAntigas}
              />
            ) : null}
            {tab === 'prox' && interest.gathering && upcoming.length ? (
              <p className="pn-note pn-gather">
                Estamos reunindo dados sobre o interesse no seu bar. O sinal
                aparece depois dos primeiros jogos.
              </p>
            ) : null}
            {list.length === 0 ? (
              <Vazio
                tab={tab}
                query={query}
                canCreate={canCreate}
                blockReason={blockReason}
                onNew={() => setSheet({ kind: 'new' })}
              />
            ) : (
              <Lista
                events={list}
                tab={tab}
                now={now}
                today={today}
                bar={bar}
                elite={elite}
                showsGoing={showsGoing}
                goingById={goingById}
                numbers={eventNumbers}
                interest={interest.ratio}
                selected={shown?.id}
                onOpen={open}
              />
            )}
            {tab === 'rasc' || tab === 'prox' ? null : (
              <Link
                to="/admin/desempenho"
                hash="como-cada-jogo"
                className="pn-soon pn-soon-go"
              >
                <Ranking size={20} />
                <span>
                  <b>Como cada jogo foi</b> · quem viu e quem se interessou em
                  cada jogo do período, e “Comparar jogos”, em Desempenho.
                </span>
                <Arrow size={18} />
              </Link>
            )}
          </div>
          {wide && detail ? (
            <aside className="pn-det" aria-label="Jogo aberto">
              {detail}
            </aside>
          ) : null}
        </div>
      )}

      {!wide && detail && selected ? (
        <DetalheFolha onClose={() => setSelected(null)}>{detail}</DetalheFolha>
      ) : null}

      {sheet ? <NovoJogo mode={sheet} onClose={() => setSheet(null)} /> : null}

      {deleting ? (
        <EventDeleteDialog
          event={deleting}
          isDeleting={del.isPending}
          error={del.error ? getDeleteErrorMessage(del.error) : undefined}
          onConfirm={() => del.mutate({ eventId: deleting.id })}
          onCancel={() => setDeletingId(null)}
        />
      ) : null}
    </>
  )
}

function Vazio({
  tab,
  query,
  canCreate,
  blockReason,
  onNew
}: {
  tab: Tab
  query: string
  canCreate: boolean
  blockReason: string | null
  onNew: () => void
}) {
  if (query.trim()) {
    return (
      <div className="pn-card pn-empty">
        <p className="pn-disp">Nada com “{query.trim()}”</p>
        <p>Tente o nome de um time ou do campeonato.</p>
      </div>
    )
  }
  if (tab === 'rasc') {
    return (
      <div className="pn-card pn-empty">
        <p className="pn-disp">Nenhum rascunho</p>
        <p>Jogo salvo sem publicar aparece aqui. O torcedor não vê.</p>
        {canCreate ? (
          <button type="button" className="pn-btn pn-ink pn-sm" onClick={onNew}>
            <Add size={18} />
            Novo jogo
          </button>
        ) : null}
      </div>
    )
  }
  if (tab === 'pass') {
    return (
      <div className="pn-card pn-empty">
        <p className="pn-disp">Nenhum jogo passado</p>
        <p>Depois do primeiro jogo, aqui fica quem viu e quem foi.</p>
      </div>
    )
  }
  return (
    <div className="pn-card pn-empty">
      <p className="pn-disp">Nenhum jogo marcado</p>
      <p>
        Cadastre os jogos que o bar vai passar. Quem procura onde ver o jogo
        acha o seu bar por eles.
      </p>
      {canCreate ? (
        <button type="button" className="pn-btn pn-ink pn-sm" onClick={onNew}>
          <Add size={18} />
          Novo jogo
        </button>
      ) : blockReason ? (
        <p className="pn-block">{blockReason}</p>
      ) : null}
    </div>
  )
}

type RowProps = {
  events: AdminEvent[]
  tab: Tab
  now: number
  today: string
  bar: ReturnType<typeof useMyBar>['data']
  elite: boolean
  showsGoing: boolean
  goingById: Map<string, GoingGame>
  numbers: Map<string, EventNumbers>
  interest: Map<string, number>
  selected: string | undefined
  onOpen: (id: string) => void
}

function Lista(props: RowProps) {
  const { events, tab, today } = props
  const groups = new Map<string, AdminEvent[]>()
  for (const event of events) {
    const day = brasiliaDay(event.startsAt)
    groups.set(day, [...(groups.get(day) ?? []), event])
  }
  return (
    <>
      {[...groups].map(([day, items]) => (
        <section key={day} aria-label={relativeDayLabel(day, today)}>
          <h2 className="pn-day">
            {tab === 'prox' ? relativeDayLabel(day, today) : dayLabel(day)}
          </h2>
          <ul className="pn-rows">
            {items.map((event) => (
              <Linha key={event.id} event={event} {...props} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function Linha({
  event,
  tab,
  now,
  today,
  bar,
  elite,
  showsGoing,
  goingById,
  numbers,
  interest,
  selected,
  onOpen
}: RowProps & { event: AdminEvent }) {
  const state = eventState(event, now)
  const day = brasiliaDay(event.startsAt)
  const counts = goingCount(goingById.get(event.id))
  const ratio = interest.get(event.id)
  const screen = bar ? gameScreen(event, bar) : null
  const offer = bar ? gameOffer(event, bar, elite) : null
  const draft = isDraft(event)
  const ahead = tab !== 'pass'
  // A faixa de números (WEB-433): antes, ao vivo e depois do jogo.
  const faixa =
    draft || !bar
      ? null
      : faixaDoJogo({
          state:
            state === 'live' ? 'live' : tab === 'pass' ? 'past' : 'upcoming',
          numbers: numbers.get(event.id),
          startsAt: event.startsAt,
          now,
          neighborhood: bar.neighborhood,
          going: showsGoing ? counts : undefined
        })
  return (
    <li>
      <button
        type="button"
        className={`pn-row${selected === event.id ? ' is-on' : ''}`}
        aria-pressed={selected === event.id}
        onClick={() => onOpen(event.id)}
      >
        <span className="pn-h">
          {brasiliaTime(event.startsAt)}
          <small>
            {state === 'live'
              ? 'ao vivo'
              : tab === 'pass'
                ? dayLabel(day)
                : day === today
                  ? `em ${inLabel(Date.parse(event.startsAt) - now)}`
                  : day === shiftDay(today, 1)
                    ? 'amanhã'
                    : dayLabel(day)}
          </small>
        </span>
        <span className="pn-row-m">
          <b>{eventTitle(event)}</b>
          <span className="pn-m">
            {[event.championship, event.sport?.name]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {ratio !== undefined && tab === 'prox' ? (
            <span className="pn-m">{interestLabel(ratio)}</span>
          ) : null}
          <span className="pn-chips">
            {ahead && screen?.onBigScreen ? (
              <span className="pn-chip">
                <Tv size={15} />
                Telão
              </span>
            ) : null}
            {ahead && screen?.withSound ? (
              <span className="pn-chip">
                <Sound size={15} />
                Som
              </span>
            ) : null}
            {ahead && offer ? (
              <span className="pn-chip">
                <Beer size={15} />
                Oferta
              </span>
            ) : null}
            <Selo state={state} draft={draft} />
          </span>
        </span>
        {faixa ? (
          <span className="pn-pst">
            {faixa.map((c) => (
              <span key={c.rotulo} className="pn-ps">
                <b className={c.verde ? 'is-up' : undefined}>{c.valor}</b>
                <span>
                  {c.rotulo}
                  {c.extra ? <i>{c.extra}</i> : null}
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function Semana({
  days,
  today,
  events,
  offset,
  onOffset,
  canCreate,
  onOpen,
  onNew
}: {
  days: string[]
  today: string
  events: AdminEvent[]
  offset: number
  onOffset: (offset: number) => void
  canCreate: boolean
  onOpen: (id: string) => void
  onNew: (day: string) => void
}) {
  const first = days[0] ?? today
  const last = days.at(-1) ?? today
  return (
    <>
      <div className="pn-wnav">
        <button
          type="button"
          className="pn-btn pn-ghost pn-ic"
          aria-label="Semana anterior"
          onClick={() => onOffset(offset - 1)}
        >
          <span className="pn-flip">
            <Arrow size={18} />
          </span>
        </button>
        <span className="pn-mono">
          {weekdayShort(first).date} – {weekdayShort(last).date}
        </span>
        <button
          type="button"
          className="pn-btn pn-ghost pn-ic"
          aria-label="Próxima semana"
          onClick={() => onOffset(offset + 1)}
        >
          <Arrow size={18} />
        </button>
        {offset !== 0 ? (
          <button
            type="button"
            className="pn-lnk pn-lnk-b"
            onClick={() => onOffset(0)}
          >
            Esta semana
          </button>
        ) : null}
      </div>
      <div className="pn-week">
        {days.map((day) => {
          const label = weekdayShort(day)
          const games = events
            .filter((event) => brasiliaDay(event.startsAt) === day)
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
          return (
            <div
              key={day}
              className={`pn-wd${day === today ? ' is-today' : ''}`}
            >
              <h3>
                {label.weekday}
                <b>{label.date}</b>
              </h3>
              {games.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`pn-wg${isDraft(event) ? ' is-draft' : ''}`}
                  onClick={() => onOpen(event.id)}
                >
                  <b>{brasiliaTime(event.startsAt)}</b>
                  {eventTitle(event)}
                  {isDraft(event) ? (
                    <span className="sr-only"> (rascunho)</span>
                  ) : null}
                </button>
              ))}
              {canCreate && day >= today ? (
                <button
                  type="button"
                  className="pn-wadd"
                  aria-label={`Novo jogo em ${dayLabel(day)}`}
                  onClick={() => onNew(day)}
                >
                  + jogo
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Detalhe({
  event,
  now,
  bar,
  elite,
  showsGoing,
  game,
  row,
  interest,
  canCreate,
  saving,
  patchError,
  onPatch,
  onEdit,
  onDuplicate,
  onDelete
}: {
  event: AdminEvent
  now: number
  bar: ReturnType<typeof useMyBar>['data']
  elite: boolean
  showsGoing: boolean
  game: GoingGame | undefined
  row: { uniqueVisitors: number; arrivals: number | null } | undefined
  interest: number | undefined
  canCreate: boolean
  saving: boolean
  patchError: string | null
  onPatch: (changes: {
    onBigScreen?: boolean
    withSound?: boolean
    attendanceEnabled?: boolean
    noHouseOffer?: boolean
    publish?: true
  }) => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const state = eventState(event, now)
  const day = brasiliaDay(event.startsAt)
  const today = brasiliaDay(now)
  const counts = goingCount(game)
  const screens = bar ? barScreen(bar).screens : null
  const screen = bar ? gameScreen(event, bar) : null
  const draft = isDraft(event)
  // Jogo encerrado não muda mais o que o torcedor vê: só leitura.
  const locked = state === 'past' || saving
  // A oferta que o jogo herda ou tem; "sem oferta neste jogo" a desliga.
  const offerText = event.houseOffer ?? bar?.houseOffer ?? null
  const people = [...(game?.people ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.validatedAt)) - Number(Boolean(a.validatedAt)) ||
      new Date(a.markedAt).getTime() - new Date(b.markedAt).getTime()
  )
  return (
    <>
      <div className="pn-det-top">
        <Selo state={state} draft={draft} />
        {bar ? (
          <Link
            to="/pub/$pubId"
            params={{ pubId: bar.id }}
            className="pn-btn pn-ghost pn-ic"
            aria-label="Ver no app"
            title="Ver no app"
          >
            <Share size={18} />
          </Link>
        ) : null}
      </div>
      <h2 className="pn-disp">{eventTitle(event)}</h2>
      <p className="pn-det-m">
        {event.championship} ·{' '}
        {day === today
          ? 'hoje'
          : day === shiftDay(today, 1)
            ? 'amanhã'
            : dayLabel(day)}
        , {brasiliaTime(event.startsAt)}
      </p>

      {showsGoing || row ? (
        <div className="pn-trio">
          {showsGoing ? (
            <>
              <div>
                <b>{counts.going}</b>
                <span>vão assistir</span>
              </div>
              <div>
                <b>{counts.arrived}</b>
                <span>validaram</span>
              </div>
            </>
          ) : null}
          {row ? (
            <div>
              <b>{row.uniqueVisitors}</b>
              <span>viram o jogo</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {interest !== undefined && state !== 'past' ? (
        <p className="pn-note">{interestLabel(interest)}.</p>
      ) : null}

      {elite && offerText ? (
        <div className="pn-offer">
          <span className="pn-ib">
            <Beer size={20} />
          </span>
          <span>
            <b>Oferta da casa neste jogo</b>
            <span>
              {event.noHouseOffer
                ? 'Desligada neste jogo. O torcedor não vê a oferta.'
                : offerText}
            </span>
          </span>
          <Interruptor
            ligado={!event.noHouseOffer}
            onChange={(ligado) => onPatch({ noHouseOffer: !ligado })}
            rotulo="Oferta da casa neste jogo"
            disabled={locked}
          />
        </div>
      ) : null}

      {screen ? (
        <div className="pn-sws">
          <div className="pn-sw">
            <Tv size={20} />
            <span>
              {screens && screens > 1
                ? `Passa nos ${screens} telões`
                : 'Passa no telão'}
            </span>
            <Interruptor
              ligado={screen.onBigScreen}
              onChange={(onBigScreen) => onPatch({ onBigScreen })}
              rotulo="Passa no telão"
              disabled={locked}
            />
          </div>
          <div className="pn-sw">
            <Sound size={20} />
            <span>Som do jogo ligado</span>
            <Interruptor
              ligado={screen.withSound}
              onChange={(withSound) => onPatch({ withSound })}
              rotulo="Som do jogo ligado"
              disabled={locked}
            />
          </div>
          {elite ? (
            <div className="pn-sw">
              <People size={20} />
              <span>
                Lista de quem vai
                {event.attendanceEnabled ? null : (
                  <small>
                    Fechada: ninguém novo marca. Quem já marcou segue com o
                    código.
                  </small>
                )}
              </span>
              <Interruptor
                ligado={event.attendanceEnabled}
                onChange={(attendanceEnabled) => onPatch({ attendanceEnabled })}
                rotulo="Lista de quem vai neste jogo"
                disabled={locked}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {patchError ? (
        <p className="pn-ferr" role="alert">
          {patchError}
        </p>
      ) : null}

      {showsGoing && !draft && event.attendanceEnabled ? (
        <>
          <div className="pn-chd pn-det-who">
            <h3>Quem vai</h3>
            <small>
              {counts.going} {counts.going === 1 ? 'marcou' : 'marcaram'}
            </small>
          </div>
          {people.length ? (
            <>
              <ul className="pn-who">
                {people.slice(0, 6).map((person, i) => (
                  <li key={`${person.name}-${person.markedAt}`}>
                    <span
                      className="pn-pa"
                      style={{
                        background: AVATAR_COLORS[i % AVATAR_COLORS.length]
                      }}
                    >
                      {initials(person.name)}
                    </span>
                    <span>
                      <b>{person.name}</b>
                      <span>
                        {person.validatedAt
                          ? `chegou ${brasiliaTime(person.validatedAt)}`
                          : `marcou ${dayLabel(brasiliaDay(person.markedAt))}`}
                      </span>
                      {person.validatedAt && person.useId ? (
                        <Desfazer
                          useId={person.useId}
                          name={person.name}
                          until={
                            new Date(person.validatedAt).getTime() +
                            ARRIVAL_UNDO_WINDOW_MS
                          }
                        />
                      ) : null}
                    </span>
                    {person.validatedAt ? (
                      <span className="pn-ok">
                        <Check size={14} />
                        Validou
                      </span>
                    ) : (
                      <span className="pn-badge">A CAMINHO</span>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                to="/admin/quem-vai"
                hash={`jogo-${event.id}`}
                className="pn-go"
              >
                Ver os {counts.going} <Arrow size={16} />
              </Link>
            </>
          ) : (
            <p className="pn-note">
              {state === 'past'
                ? 'Ninguém marcou este jogo.'
                : 'Ninguém marcou ainda. Quem marcar “Vou assistir aqui” aparece aqui, com o código para validar.'}
            </p>
          )}
        </>
      ) : null}

      <div className="pn-det-acts">
        {draft ? (
          <button
            type="button"
            className="pn-btn pn-acid pn-sm"
            disabled={saving || state === 'past'}
            onClick={() => onPatch({ publish: true })}
          >
            {saving ? 'Publicando…' : 'Publicar'}
          </button>
        ) : null}
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          onClick={onEdit}
        >
          Editar
        </button>
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          onClick={onDuplicate}
          disabled={!canCreate}
          title="Abre o jogo uma semana depois, para revisar e publicar"
        >
          Duplicar
        </button>
        <button
          type="button"
          className="pn-btn pn-danger pn-sm"
          onClick={onDelete}
        >
          Excluir
        </button>
      </div>
    </>
  )
}

/** Publicado, rascunho (tracejado), ao vivo ou encerrado. */
function Selo({
  state,
  draft
}: {
  state: ReturnType<typeof eventState>
  draft: boolean
}) {
  if (draft) return <span className="pn-badge is-draft">RASCUNHO</span>
  return (
    <span
      className={`pn-badge ${state === 'live' ? 'is-live' : state === 'past' ? '' : 'is-pub'}`}
    >
      {state === 'live'
        ? 'AO VIVO'
        : state === 'past'
          ? 'ENCERRADO'
          : 'PUBLICADO'}
    </span>
  )
}

function DetalheFolha({
  children,
  onClose
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // A folha é modal nativa (camada de cima): a confirmação do "Desfazer"
  // precisa abrir dentro dela, senão fica por baixo e não recebe o toque.
  const portal = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className="pn-sheet pn-detsheet"
      aria-label="Jogo aberto"
      // O React repassa o `close` de um `<dialog>` de dentro (a confirmação
      // do "Desfazer") para este: só fecha a folha o fechamento dela mesma.
      onClose={(event) => {
        if (event.target === ref.current) onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="pn-sheet-in">
        <header>
          <span />
          <button
            type="button"
            className="pn-btn pn-ghost pn-ic"
            aria-label="Fechar"
            onClick={onClose}
          >
            <Close size={18} />
          </button>
        </header>
        <div className="pn-sheet-body">
          <PortalProvider container={portal}>{children}</PortalProvider>
        </div>
      </div>
      <div ref={portal} className="onside-app pn-portal" />
    </dialog>
  )
}
