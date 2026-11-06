import { getEventEnd } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { AdminEvent } from '@/components/admin/admin-model'
import {
  useMyBar,
  useMyEventCreationPolicy,
  useMyEvents
} from '@/components/admin/admin-queries'
import { getAnalyticsRange } from '@/components/admin/analytics-period'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Add,
  Arrow,
  Beer,
  Check,
  Close,
  Qr,
  Share,
  Sound,
  Tv
} from '@/components/landing/v3/icons'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { Avisos, PlanoCard } from './avisos'
import {
  barScreen,
  type GoingGame,
  goingCount,
  interestLabel,
  useGoing,
  useInterest
} from './dados'
import {
  brasiliaTime,
  countdown,
  dayLabel,
  eventState,
  eventTitle,
  houseDay,
  longDayLabel,
  nightRule
} from './noite'
import { NovoJogo, type NovoJogoMode } from './novo-jogo'
import { initials, usePainel } from './painel-shell'

/*
 * Hoje (WEB-501, fase 2; protótipo `hoje`, `chart`, `smooth`): o jogo de
 * agora em destaque, a régua da noite, quem chegou, os 30 dias do bar, as
 * avaliações e o plano. Lista aberta e oferta por jogo não existem neste
 * branch: o herói mostra a oferta do bar, só leitura.
 */

const AVATAR_COLORS = [
  '#c9f135',
  '#f6b8a6',
  '#b8d2f0',
  '#e7d3a8',
  '#cfe3b0',
  '#e3c0e8'
]

export function HojePage() {
  const now = useMinuteNow()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const policy = useMyEventCreationPolicy()
  const going = useGoing()
  const interest = useInterest()
  const { showsGoing, elite, openValidation } = usePainel()
  const [sheet, setSheet] = useState<NovoJogoMode | null>(null)

  if (!bar) return null
  const today = houseDay(now)
  const all = events.data ?? []
  const todays = all
    .filter(
      (event) =>
        houseDay(event.startsAt) === today || eventState(event, now) === 'live'
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const hero =
    todays.find((event) => eventState(event, now) === 'live') ??
    all
      .filter((event) => eventState(event, now) === 'upcoming')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]

  const goingById = new Map((going.data ?? []).map((g) => [g.id, g]))
  const todayTotals = todays.reduce(
    (sum, event) => {
      const c = goingCount(goingById.get(event.id))
      return { going: sum.going + c.going, arrived: sum.arrived + c.arrived }
    },
    { going: 0, arrived: 0 }
  )
  const canCreate = policy.data?.canCreate === true

  return (
    <>
      <header className="pn-head">
        <div>
          <p className="pn-k">
            {longDayLabel(today)} · {bar.neighborhood} · agora{' '}
            {brasiliaTime(new Date(now))}
          </p>
          <h1 className="pn-disp">Hoje na casa</h1>
          <p className="pn-sub">
            {events.isLoading
              ? 'Carregando a grade…'
              : [
                  todays.length
                    ? `${todays.length} ${todays.length === 1 ? 'jogo' : 'jogos'} hoje`
                    : 'Nenhum jogo hoje',
                  showsGoing && going.data
                    ? `${todayTotals.going} vão assistir`
                    : null,
                  showsGoing && going.data
                    ? `${todayTotals.arrived} já chegaram`
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
        <div className="pn-acts">
          <Link
            to="/pub/$pubId"
            params={{ pubId: bar.id }}
            className="pn-btn pn-ghost pn-sm pn-gh"
          >
            <Share size={18} />
            Ver no app
          </Link>
          {/* Sem poder criar (limite, fora do ar), vira "Ver grade" (WEB-353). */}
          {policy.data && !canCreate ? (
            <Link to="/admin/jogos" className="pn-btn pn-ghost pn-sm">
              Ver grade
            </Link>
          ) : (
            <button
              type="button"
              className="pn-btn pn-ink pn-sm"
              disabled={!policy.data}
              onClick={() => setSheet({ kind: 'new' })}
            >
              <Add size={18} />
              Novo jogo
            </button>
          )}
        </div>
      </header>

      <Avisos />

      {events.isError ? (
        <div className="pn-aviso is-error" role="alert">
          <div className="pn-aviso-t">
            <b>
              {getUserFacingMessage(
                events.error,
                'Não foi possível carregar os eventos.'
              )}
            </b>
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
      ) : null}

      {events.isLoading ? (
        <div className="pn-skel pn-now-skel" aria-hidden="true">
          <i />
        </div>
      ) : (
        <Agora
          hero={hero}
          now={now}
          today={today}
          bar={bar}
          elite={elite}
          showsGoing={showsGoing}
          game={hero ? goingById.get(hero.id) : undefined}
          interest={hero ? interest.ratio.get(hero.id) : undefined}
          canCreate={canCreate}
          onNew={() => setSheet({ kind: 'new' })}
          onValidate={openValidation}
        />
      )}

      <Noite
        games={todays}
        now={now}
        goingById={goingById}
        showsGoing={showsGoing}
        heroId={hero?.id}
      />

      <div className="pn-duo">
        {showsGoing ? (
          <Chegaram
            games={going.data}
            today={today}
            offer={elite && Boolean(bar.houseOffer)}
          />
        ) : null}
        <TrintaDias />
        <Avaliacoes />
        <PlanoCard />
      </div>

      {sheet ? <NovoJogo mode={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  )
}

function Agora({
  hero,
  now,
  today,
  bar,
  elite,
  showsGoing,
  game,
  interest,
  canCreate,
  onNew,
  onValidate
}: {
  hero: AdminEvent | undefined
  now: number
  today: string
  bar: NonNullable<ReturnType<typeof useMyBar>['data']>
  elite: boolean
  showsGoing: boolean
  game: GoingGame | undefined
  interest: number | undefined
  canCreate: boolean
  onNew: () => void
  onValidate: () => void
}) {
  if (!hero) {
    return (
      <section className="pn-now is-empty" aria-label="Próximo jogo">
        <div className="pn-now-l">
          <span className="pn-tag">SEM JOGO MARCADO</span>
          <h2 className="pn-disp">
            Nenhum jogo <span>na grade</span>
          </h2>
          <p className="pn-now-p">
            Quem procura onde ver o jogo só acha o seu bar com o jogo
            cadastrado. Leva um minuto.
          </p>
          <div className="pn-acts">
            {canCreate ? (
              <button type="button" className="pn-btn pn-acid" onClick={onNew}>
                <Add size={20} />
                Cadastrar o primeiro jogo
              </button>
            ) : (
              <Link to="/admin/jogos" className="pn-btn pn-acid">
                Ver grade
              </Link>
            )}
          </div>
        </div>
      </section>
    )
  }

  const live = eventState(hero, now) === 'live'
  const isToday = houseDay(hero.startsAt) === today
  const title = eventTitle(hero)
  const [home, away] = title.split(' × ')
  const screen = barScreen(bar)
  const counts = goingCount(game)
  const startsIn = Date.parse(hero.startsAt) - now

  return (
    <section
      className={`pn-now${live ? ' is-live' : ''}`}
      aria-label={live ? 'Jogo ao vivo' : 'Próximo jogo'}
    >
      <div className="pn-now-l">
        <span className="pn-tag">
          <i />
          {live ? 'AO VIVO' : 'PRÓXIMO JOGO'} ·{' '}
          {isToday
            ? ''
            : `${dayLabel(houseDay(hero.startsAt)).toUpperCase()} · `}
          {brasiliaTime(hero.startsAt)} · {hero.championship.toUpperCase()}
        </span>
        <h2 className="pn-disp">
          {away ? (
            <>
              {home} <span>×</span> {away}
            </>
          ) : (
            title
          )}
        </h2>
        {screen.tv || screen.sound ? (
          <ul className="pn-meta">
            {screen.tv ? (
              <li>
                <Tv size={16} />
                {screen.screens && screen.screens > 1
                  ? `${screen.screens} telões`
                  : 'Telão'}
              </li>
            ) : null}
            {screen.sound ? (
              <li>
                <Sound size={16} />
                Som ligado
              </li>
            ) : null}
          </ul>
        ) : null}
        {elite && bar.houseOffer ? (
          <div className="pn-offer">
            <span className="pn-ib">
              <Beer size={20} />
            </span>
            <span>
              <b>Oferta da casa</b>
              <span>{bar.houseOffer}</span>
            </span>
            <Link to="/admin/meu-espaco" className="pn-offer-ed">
              Editar
            </Link>
          </div>
        ) : null}
        <div className="pn-acts">
          {showsGoing ? (
            <button
              type="button"
              className="pn-btn pn-acid"
              onClick={onValidate}
            >
              <Qr size={20} />
              Validar código
            </button>
          ) : null}
          <Link
            to="/admin/jogos"
            search={{ jogo: hero.id }}
            className="pn-btn pn-ghost pn-sm pn-tall"
          >
            Abrir o jogo
          </Link>
          {showsGoing ? (
            <Link
              to="/admin/quem-vai"
              className="pn-btn pn-ghost pn-sm pn-tall"
            >
              Ver quem vai
            </Link>
          ) : null}
        </div>
      </div>
      <div className="pn-now-r">
        <div className="pn-cd">
          {live ? 'TERMINA EM' : 'A BOLA ROLA EM'}
          <b>
            {live
              ? countdown(getEventEnd(hero).getTime() - now)
              : startsIn < 24 * 3_600_000
                ? countdown(startsIn)
                : dayLabel(houseDay(hero.startsAt))}
          </b>
        </div>
        {showsGoing ? (
          <>
            <div className="pn-trio">
              <div>
                <b>{counts.going}</b>
                <span>vão assistir</span>
              </div>
              <div>
                <b>{counts.arrived}</b>
                <span>já chegaram</span>
              </div>
              <div>
                <b>{counts.going - counts.arrived}</b>
                <span>ainda a caminho</span>
              </div>
            </div>
            <div>
              <div className="pn-cd pn-cd-row">
                <span>CHEGADAS</span>
                <span>
                  {counts.arrived} DE {counts.going}
                </span>
              </div>
              <div className="pn-bar">
                <i
                  style={{
                    width: `${counts.going ? Math.round((counts.arrived / counts.going) * 100) : 0}%`
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="pn-now-p">
            {interest !== undefined
              ? `${interestLabel(interest)}.`
              : 'Quem vai e quem chegou, com o código no balcão, são do plano Elite.'}{' '}
            {interest === undefined ? (
              <Link to="/plan" search={{ origin: 'admin' }} className="pn-lnk">
                Conhecer o Elite
              </Link>
            ) : null}
          </p>
        )}
      </div>
    </section>
  )
}

function Noite({
  games,
  now,
  goingById,
  showsGoing,
  heroId
}: {
  games: AdminEvent[]
  now: number
  goingById: Map<string, GoingGame>
  showsGoing: boolean
  heroId: string | undefined
}) {
  const rule = nightRule(games, now)
  const step = 100 / (rule.hours.length - 1)
  const wrap = useRef<HTMLDivElement>(null)
  // No celular a régua rola: abre no "agora", como no protótipo.
  const nowAt = rule.nowAt
  useEffect(() => {
    const el = wrap.current
    if (el && nowAt !== null) {
      el.scrollLeft = Math.max(0, (nowAt / 100) * el.scrollWidth - 80)
    }
  }, [nowAt])
  return (
    <section className="pn-card pn-night" aria-labelledby="pn-night-t">
      <div className="pn-chd">
        <h3 id="pn-night-t">A noite</h3>
        <small>
          {String(rule.hours[0]?.hour).padStart(2, '0')}h →{' '}
          {String(rule.hours.at(-1)?.hour).padStart(2, '0')}h
          {games.length ? ' · toque num jogo para abrir' : ''}
        </small>
      </div>
      <div className="pn-rule-wrap" ref={wrap}>
        <div
          className="pn-rule"
          style={{
            height: 46 + rule.lanes * 72,
            minWidth: Math.max(720, (rule.hours.length - 1) * 100)
          }}
        >
          <div className="pn-hours" aria-hidden="true">
            {rule.hours.map(({ hour, at }) => (
              <span key={at} style={{ left: `${at}%` }}>
                {String(hour).padStart(2, '0')}h
              </span>
            ))}
          </div>
          <div
            className="pn-grid"
            style={{ backgroundSize: `${step}% 100%` }}
            aria-hidden="true"
          />
          {rule.nowAt !== null ? (
            <div
              className="pn-nowline"
              style={{ left: `${rule.nowAt}%` }}
              aria-hidden="true"
            />
          ) : null}
          {rule.tracks.map(({ event, left, width, lane }) => {
            const c = goingCount(goingById.get(event.id))
            const state = eventState(event, now)
            return (
              <Link
                key={event.id}
                to="/admin/jogos"
                search={{ jogo: event.id }}
                className={`pn-trk${event.id === heroId ? ' is-hot' : ''}${state === 'past' ? ' is-past' : ''}`}
                style={{
                  left: `calc(${left}% + 3px)`,
                  width: `max(calc(${width}% - 6px), 190px)`,
                  top: 40 + lane * 72
                }}
              >
                <span className="pn-t1">
                  <span>
                    {brasiliaTime(event.startsAt)} · {event.championship}
                  </span>
                  {showsGoing ? (
                    <span>
                      {c.going ? `${c.going} vão` : 'ninguém marcou ainda'}
                    </span>
                  ) : null}
                </span>
                <b>{eventTitle(event)}</b>
                {showsGoing && c.going ? (
                  <span
                    className="pn-pg"
                    style={{
                      width: `${Math.round((c.arrived / c.going) * 100)}%`
                    }}
                  />
                ) : null}
              </Link>
            )
          })}
          {games.length === 0 ? (
            <p className="pn-rule-empty">Nenhum jogo na noite de hoje.</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Chegaram({
  games,
  today,
  offer
}: {
  games: ReturnType<typeof useGoing>['data']
  today: string
  offer: boolean
}) {
  const arrivals = (games ?? [])
    .flatMap((game) =>
      game.people
        .filter(
          (person) =>
            person.validatedAt && houseDay(person.validatedAt) === today
        )
        .map((person) => ({ ...person, game }))
    )
    .sort(
      (a, b) =>
        new Date(b.validatedAt ?? 0).getTime() -
        new Date(a.validatedAt ?? 0).getTime()
    )
  const total = (games ?? []).reduce((sum, g) => sum + g.people.length, 0)
  return (
    <section className="pn-card" aria-labelledby="pn-arr-t">
      <div className="pn-chd">
        <h3 id="pn-arr-t">Chegaram agora</h3>
        <small>
          {arrivals.length}{' '}
          {arrivals.length === 1 ? 'validado hoje' : 'validados hoje'}
        </small>
      </div>
      {arrivals.length ? (
        <ul className="pn-arr">
          {arrivals.slice(0, 5).map((person, i) => (
            <li key={`${person.game.id}-${person.name}-${person.validatedAt}`}>
              <span
                className="pn-pa"
                style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {initials(person.name)}
              </span>
              <span>
                <b>{person.name}</b>
                <span>
                  {person.validatedAt ? brasiliaTime(person.validatedAt) : ''} ·{' '}
                  {[...person.game.participants].join(' × ') ||
                    person.game.participantFreeText ||
                    person.game.championship}
                </span>
              </span>
              <span className="pn-ok">
                <Check size={14} />
                {offer ? 'Oferta liberada' : 'Validou'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pn-note">
          Ninguém validou o código hoje ainda. Quem chegar e mostrar o código
          aparece aqui.
        </p>
      )}
      {total ? (
        <Link to="/admin/quem-vai" className="pn-go">
          Ver os {total} <Arrow size={16} />
        </Link>
      ) : null}
    </section>
  )
}

/** Variação em badge: "+13%", "−4 p.p.", ou nada sem base. */
function Delta({ value, unit }: { value: number | null; unit: '%' | 'p.p.' }) {
  if (value === null || !Number.isFinite(value)) return null
  const text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit === '%' ? '%' : ' p.p.'}`
  return <em className={value < 0 ? 'is-down' : undefined}>{text}</em>
}

function TrintaDias() {
  const trpc = useTRPC()
  const [range] = useState(() => getAnalyticsRange('30d'))
  const q = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(range),
    meta: { errorToast: false }
  })
  const d = q.data
  const rate = d?.uniqueVisitors ? d.interestedPeople / d.uniqueVisitors : null
  const prevRate =
    d?.uniqueVisitorsPrev && d.interestedPeoplePrev !== null
      ? d.interestedPeoplePrev / d.uniqueVisitorsPrev
      : null
  const daily = d?.dailyProfileViews
    ? sumDaily([
        d.dailyProfileViews,
        d.dailyDirectionsOpened,
        d.dailyPhoneClicked,
        d.dailyWhatsappOpened
      ])
    : null

  return (
    <section className="pn-card" aria-labelledby="pn-30-t">
      <div className="pn-chd">
        <h3 id="pn-30-t">Seu bar nos últimos 30 dias</h3>
        <small>vs 30 dias antes</small>
      </div>
      {q.isLoading ? (
        <div className="pn-skel pn-nums-skel" aria-busy="true">
          <span className="sr-only">Carregando os números…</span>
          <i />
        </div>
      ) : q.isError || !d ? (
        <div className="pn-err" role="alert">
          <p>
            {getUserFacingMessage(
              q.error,
              'Não foi possível carregar as métricas. Tente novamente.'
            )}
          </p>
          {isRetryableError(q.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void q.refetch()}
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="pn-nums">
            <div>
              <b>{d.uniqueVisitors.toLocaleString('pt-BR')}</b>
              <span>pessoas viram seu bar</span>
              <Delta
                value={d.uniqueVisitorsPrev ? d.uniqueVisitorsChange : null}
                unit="%"
              />
            </div>
            <div>
              <b>{d.interestedPeople.toLocaleString('pt-BR')}</b>
              <span>se interessaram por um jogo</span>
              <Delta
                value={d.interestedPeoplePrev ? d.interestedPeopleChange : null}
                unit="%"
              />
            </div>
            <div>
              <b>
                {rate === null
                  ? '—'
                  : `${(Math.min(1, rate) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
              </b>
              <span>taxa de interesse</span>
              <Delta
                value={
                  rate !== null && prevRate !== null
                    ? Math.round(
                        (Math.min(1, rate) - Math.min(1, prevRate)) * 1000
                      ) / 10
                    : null
                }
                unit="p.p."
              />
            </div>
          </div>
          {daily ? (
            <Chart points={daily} />
          ) : (
            <p className="pn-note">
              A atividade dia a dia (perfil, rota, telefone e WhatsApp) é do
              plano Elite.
            </p>
          )}
        </>
      )}
      <Link to="/admin/desempenho" className="pn-go">
        Ver desempenho <Arrow size={16} />
      </Link>
    </section>
  )
}

type Daily = { date: string; value: number }[] | null

function sumDaily(series: Daily[]): number[] {
  const byDate = new Map<string, number>()
  for (const points of series) {
    for (const point of points ?? []) {
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.value)
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
}

/** Curva do protótipo (`smooth`, `avg3`): média de três dias, suavizada. */
function smooth(points: [number, number][]): string {
  const [first] = points
  if (!first) return ''
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i] as [number, number]
    const p0 = points[i - 1] ?? p1
    const p2 = points[i + 1] as [number, number]
    const p3 = points[i + 2] ?? p2
    const t = 0.18
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

function Chart({ points: raw }: { points: number[] }) {
  if (raw.length < 2) return null
  const W = 600
  const H = 150
  const values = raw.map((v, i) => {
    const a = raw[i - 1] ?? v
    const b = raw[i + 1] ?? v
    return (a + 2 * v + b) / 4
  })
  const peak = Math.max(...raw)
  const max = Math.max(4, ...values) * 1.1
  const pts = values.map(
    (v, i) =>
      [i * (W / (values.length - 1)), H - 14 - (v / max) * (H - 34)] as [
        number,
        number
      ]
  )
  const line = smooth(pts)
  const last = pts.at(-1) as [number, number]
  return (
    <svg
      className="pn-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Atividade por dia nos últimos 30 dias (perfil, rota, telefone e WhatsApp), pico de ${peak}`}
    >
      <defs>
        <linearGradient id="pn-gA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9f135" stopOpacity=".75" />
          <stop offset="1" stopColor="#c9f135" stopOpacity=".04" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H - 14 - f * (H - 34)}
          y2={H - 14 - f * (H - 34)}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      <path d={`${line} L${W} ${H - 14} L0 ${H - 14} Z`} fill="url(#pn-gA)" />
      <path
        d={line}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="5"
        fill="var(--chart-line)"
        stroke="var(--card)"
        strokeWidth="3"
      />
    </svg>
  )
}

function Avaliacoes() {
  const trpc = useTRPC()
  const q = useQuery({
    ...trpc.pub.getMyRatings.queryOptions(),
    meta: { errorToast: false }
  })
  const r = q.data
  return (
    <section className="pn-card" aria-labelledby="pn-rev-t">
      <div className="pn-chd">
        <h3 id="pn-rev-t">Avaliações recentes</h3>
        {r?.percentage != null && r.total > 0 ? (
          <small>{r.percentage}% voltariam</small>
        ) : null}
      </div>
      {q.isError ? (
        <div className="pn-err" role="alert">
          <p>Não foi possível carregar as avaliações.</p>
          {isRetryableError(q.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void q.refetch()}
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : r?.recent.length ? (
        <>
          {r.recent.slice(0, 3).map((item) => (
            <div
              className="pn-rev"
              key={`${item.createdAt}-${item.startsAt}-${item.championship}`}
            >
              <span className={`pn-v${item.wouldReturn ? '' : ' is-no'}`}>
                {item.wouldReturn ? <Check size={18} /> : <Close size={16} />}
              </span>
              <span>
                <b>{item.wouldReturn ? 'Voltaria' : 'Não voltaria'}</b> ·{' '}
                {item.participants.join(' × ') ||
                  item.participantFreeText ||
                  item.championship}
                <p>{dayLabel(houseDay(item.createdAt))}</p>
              </span>
            </div>
          ))}
          {!r.isPublic ? (
            <p className="pn-note">
              A nota aparece para o torcedor a partir de {r.floor} avaliações.
            </p>
          ) : null}
        </>
      ) : (
        <p className="pn-note">
          {q.isLoading
            ? 'Carregando…'
            : 'Nenhuma avaliação ainda. Depois do jogo, quem foi diz se voltaria.'}
        </p>
      )}
    </section>
  )
}
