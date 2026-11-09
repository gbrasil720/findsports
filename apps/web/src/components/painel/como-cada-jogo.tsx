import type {
  ComparisonMetric,
  EventComparisonTarget
} from '@findsports_oficial/api/lib/commercial-analytics/types'
import { Link } from '@tanstack/react-router'
import { Fragment, useState } from 'react'
import {
  type EventAnalyticsRow,
  type EventAnalyticsState,
  type EventComparisonData,
  getInterestRate,
  getMainAction,
  sumAnalyticsActions
} from '@/components/admin/admin-model'
import { MetricHint } from '@/components/admin/metric-hint'
import { Arrow } from '@/components/landing/v3/icons'

/*
 * "Como cada jogo foi" do Desempenho (WEB-501, fase 3; protótipo
 * `desempenho`): a tabela dos jogos do período, ordenada no cliente, com o
 * detalhe de cada jogo e "Comparar jogos" (Pro e Elite, conta do servidor
 * por `comparisonTarget`). Jogos · Passados traz para cá.
 */

export type SortKey = 'saw' | 'int' | 'rate'

const rate = (row: EventAnalyticsRow) =>
  row.interestedPeople === null
    ? null
    : getInterestRate(row.interestedPeople, row.uniqueVisitors)

/** Do que mais puxou ao que menos; empate fica no mais recente. */
export function sortGames(
  rows: EventAnalyticsRow[],
  by: SortKey
): EventAnalyticsRow[] {
  const value = (row: EventAnalyticsRow) =>
    by === 'saw'
      ? row.uniqueVisitors
      : by === 'int'
        ? (row.interestedPeople ?? -1)
        : (rate(row) ?? -1)
  return [...rows].sort(
    (a, b) =>
      value(b) - value(a) || Date.parse(b.startsAt) - Date.parse(a.startsAt)
  )
}

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'))
const pctText = (value: number | null) =>
  value === null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const gameDay = (startsAt: string) =>
  new Date(startsAt)
    .toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: 'numeric',
      month: 'short'
    })
    .replace(/\./g, '')
    .replace(' de ', ' ')

export function ComoCadaJogo({
  state,
  titleId
}: {
  state: EventAnalyticsState
  titleId: string
}) {
  const [sortBy, setSortBy] = useState<SortKey>('saw')
  const [open, setOpen] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const ready = state.status === 'ready' ? state : null
  const canCompare =
    !!ready?.comparisonMode && ready.comparisonMode !== 'previous_period'

  const heading = (
    <div className="pn-chd">
      <h3 id={titleId}>
        Como cada jogo foi
        <MetricHint metric="eventPerformance" />
      </h3>
      {ready ? <small>toque no título da coluna para ordenar</small> : null}
    </div>
  )

  if (state.status === 'loading') {
    return (
      <>
        {heading}
        <div className="pn-skel pn-tbl-skel" role="status" aria-busy="true">
          <span className="sr-only">Carregando desempenho por jogo…</span>
          <i />
        </div>
      </>
    )
  }
  if (state.status === 'error') {
    return (
      <>
        {heading}
        <div className="pn-err" role="alert">
          <p>
            {state.message ??
              'Não foi possível carregar o desempenho dos jogos.'}
          </p>
          {state.retryable ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={state.retry}
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      </>
    )
  }
  if (state.status === 'blocked' || state.status === 'empty' || !ready) {
    return (
      <>
        {heading}
        <p className="pn-note">
          {state.status === 'blocked'
            ? 'Seu plano não inclui analytics por jogo. Confira os planos com esse recurso na página de planos.'
            : 'Os números aparecem quando torcedores chegarem ao seu bar pelos jogos que você cadastrou.'}
        </p>
      </>
    )
  }

  const rows = sortGames(ready.items, sortBy)
  const locked = ready.items.every((row) => row.interestedPeople === null)
  const codes = ready.items.some((row) => row.reservedPeople !== null)
  const best = sortGames(ready.items, 'int')[0]
  const columns: [SortKey, string][] = [
    ['saw', 'Viram'],
    ['int', 'Interessados'],
    ['rate', 'Taxa']
  ]

  return (
    <>
      {heading}
      <div className="pn-scroll">
        <table className="pn-tbl">
          <thead>
            <tr>
              <th scope="col">Jogo</th>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  className="is-r"
                  aria-sort={sortBy === key ? 'descending' : 'none'}
                >
                  <button type="button" onClick={() => setSortBy(key)}>
                    {label}
                    {sortBy === key ? ' ↓' : ''}
                  </button>
                </th>
              ))}
              {codes ? (
                <>
                  <th scope="col" className="is-r is-rule">
                    Códigos
                  </th>
                  <th scope="col" className="is-r">
                    Validados
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open === row.eventId
              return (
                <Fragment key={row.eventId}>
                  <tr>
                    <th scope="row">
                      <button
                        type="button"
                        className="pn-tbl-g"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : row.eventId)}
                      >
                        <b>{row.eventName}</b>
                        <small>{gameDay(row.startsAt)}</small>
                      </button>
                    </th>
                    <td className="is-r">
                      <span className="pn-num">{fmt(row.uniqueVisitors)}</span>
                    </td>
                    <td className="is-r">
                      <span className="pn-num">
                        {fmt(row.interestedPeople)}
                      </span>
                    </td>
                    <td className="is-r pn-mono">{pctText(rate(row))}</td>
                    {codes ? (
                      <>
                        <td className="is-r is-rule">
                          <span className="pn-num">
                            {fmt(row.reservedPeople)}
                          </span>
                        </td>
                        <td className="is-r">
                          <span className="pn-num">{fmt(row.arrivals)}</span>
                        </td>
                      </>
                    ) : null}
                  </tr>
                  {expanded ? (
                    <tr className="pn-tbl-x">
                      <td colSpan={codes ? 6 : 4}>
                        <dl>
                          <div>
                            <dt>Aberturas</dt>
                            <dd>{fmt(row.profileViews)}</dd>
                          </div>
                          <div>
                            <dt>WhatsApp</dt>
                            <dd>{fmt(row.whatsappOpened)}</dd>
                          </div>
                          <div>
                            <dt>Rota</dt>
                            <dd>{fmt(row.directionsOpened)}</dd>
                          </div>
                          <div>
                            <dt>Telefone</dt>
                            <dd>{fmt(row.phoneClicked)}</dd>
                          </div>
                          <div>
                            <dt>Mais usado</dt>
                            <dd>
                              {row.whatsappOpened === null
                                ? '—'
                                : getMainAction(row)}
                            </dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {best?.interestedPeople ? (
        <p className="pn-note">
          Mais interessados: <b>{best.eventName}</b>, com{' '}
          {best.interestedPeople}{' '}
          {best.interestedPeople === 1 ? 'pessoa' : 'pessoas'}. Toque no jogo
          para ver WhatsApp, rota e telefone.
        </p>
      ) : (
        <p className="pn-note">Toque no jogo para ver o detalhe.</p>
      )}
      {locked ? (
        <p className="pn-note">
          Interessados e taxa por jogo são do Pro e do Elite.
        </p>
      ) : null}
      {codes ? (
        <p className="pn-hint">
          Códigos: quem marcou “Vou assistir aqui” e recebeu o código.
          Validados: os que você validou no balcão. Não se somam a interessados
          nem entram na taxa.
        </p>
      ) : null}

      <div className="pn-ccj-f">
        <Link to="/admin/jogos" search={{ passados: 1 }} className="pn-go">
          Ver os {ready.items.length}{' '}
          {ready.items.length === 1 ? 'jogo' : 'jogos'} em Jogos · Passados{' '}
          <Arrow size={16} />
        </Link>
        {canCompare ? (
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            aria-expanded={comparing}
            aria-controls="pn-cmp"
            onClick={() => setComparing(!comparing)}
          >
            {comparing ? 'Fechar a comparação' : 'Comparar jogos'}
          </button>
        ) : (
          <span className="pn-hint">
            “Comparar jogos” é do Pro e do Elite.{' '}
            <Link to="/plan" search={{ origin: 'admin' }} className="pn-lnk">
              Ver planos
            </Link>
          </span>
        )}
      </div>

      {canCompare && comparing ? <Comparar state={ready} /> : null}
    </>
  )
}

/* ─── Comparar jogos ─── */

const METRICS: [ComparisonMetric, string][] = [
  ['uniqueVisitors', 'Visitantes'],
  ['profileViews', 'Aberturas'],
  ['directionsOpened', 'Rota'],
  ['phoneClicked', 'Telefone'],
  ['whatsappOpened', 'WhatsApp']
]
const METRIC_LABEL = Object.fromEntries(METRICS) as Record<
  ComparisonMetric,
  string
>
const WEEKDAYS = [
  '',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo'
]
const num = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const conv = (value: number | null) =>
  value === null
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function Comparar({
  state
}: {
  state: Extract<EventAnalyticsState, { status: 'ready' }>
}) {
  const { items, comparisonTarget: target, comparisonMode: mode } = state
  const onChange = state.onComparisonTargetChange ?? (() => {})
  const selected = target?.type === 'events' ? target.eventIds : []
  const average = target?.type === 'event_to_bar'

  const chooseEvents = () => {
    const ids = selected.length
      ? selected
      : items.slice(0, 2).map((item) => item.eventId)
    if (ids.length) onChange({ type: 'events', eventIds: ids })
  }
  const chooseAverage = () => {
    const eventId =
      target?.type === 'event_to_bar' ? target.eventId : items[0]?.eventId
    if (eventId) onChange({ type: 'event_to_bar', eventId })
  }
  const toggle = (eventId: string) => {
    const next = selected.includes(eventId)
      ? selected.filter((id) => id !== eventId)
      : [...selected, eventId]
    onChange(
      next.length
        ? ({ type: 'events', eventIds: next } satisfies EventComparisonTarget)
        : undefined
    )
  }

  return (
    <div id="pn-cmp" className="pn-cmp">
      <div className="pn-cmp-h">
        <h4>Comparar jogos</h4>
        <span className="pn-badge">
          {mode === 'advanced' ? 'ELITE' : 'PRO'}
        </span>
      </div>
      <fieldset className="pn-tabs" aria-label="Tipo de comparação">
        <button type="button" aria-pressed={!average} onClick={chooseEvents}>
          Entre jogos
        </button>
        <button type="button" aria-pressed={average} onClick={chooseAverage}>
          Jogo contra a média do bar
        </button>
      </fieldset>

      {average ? (
        <label className="pn-fl pn-cmp-alvo">
          <span className="pn-fl-l">Jogo alvo</span>
          <select
            className="pn-inp"
            value={target?.type === 'event_to_bar' ? target.eventId : ''}
            onChange={(event) =>
              onChange({ type: 'event_to_bar', eventId: event.target.value })
            }
          >
            {items.map((item) => (
              <option key={item.eventId} value={item.eventId}>
                {item.eventName} · {gameDay(item.startsAt)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <fieldset className="pn-cmp-jogos">
          <legend className="pn-fl-l">Jogos na comparação</legend>
          <div className="pn-chips">
            {items.map((item) => (
              <button
                key={item.eventId}
                type="button"
                className="pn-tchip"
                aria-pressed={selected.includes(item.eventId)}
                onClick={() => toggle(item.eventId)}
              >
                {item.eventName}
                <small>{gameDay(item.startsAt)}</small>
              </button>
            ))}
          </div>
          {selected.length < 2 ? (
            <p className="pn-hint">
              Selecione pelo menos dois jogos com dados.
            </p>
          ) : null}
        </fieldset>
      )}

      <div aria-live="polite">
        {state.comparisonLoading ? (
          <p className="pn-hint" role="status">
            Calculando…
          </p>
        ) : null}
        {state.comparison ? <Resultado comparison={state.comparison} /> : null}
      </div>
    </div>
  )
}

function Resultado({ comparison }: { comparison: EventComparisonData }) {
  if (comparison.status === 'empty') {
    return (
      <p className="pn-note">
        {comparison.emptyReason === 'no_baseline'
          ? 'Cadastre outro jogo com dados para calcular a média do bar.'
          : comparison.emptyReason === 'not_enough_games'
            ? 'Selecione pelo menos dois jogos com dados para comparar.'
            : 'Ainda não há dados elegíveis para esta comparação.'}
      </p>
    )
  }
  const rows = comparison.benchmark
    ? [...comparison.events, comparison.benchmark]
    : comparison.events
  const history = comparison.benchmarks.filter(
    (benchmark) => benchmark.scope === 'history'
  )

  return (
    <>
      <div className="pn-scroll">
        <table className="pn-tbl pn-tbl-cmp">
          <thead>
            <tr>
              <th scope="col">Jogo</th>
              {METRICS.map(([key, label]) => (
                <th key={key} scope="col" className="is-r">
                  {label}
                </th>
              ))}
              <th scope="col" className="is-r">
                Conversão
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.eventId}>
                <th scope="row">
                  <b>{row.eventName}</b>
                </th>
                {METRICS.map(([key]) => (
                  <td key={key} className="is-r pn-mono">
                    {num(row[key])}
                  </td>
                ))}
                <td className="is-r pn-mono">
                  <b>{conv(row.conversionRate)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pn-hint">
        Os volumes são brutos; a leitura por hora usa a janela efetiva de cada
        jogo.
      </p>

      <div className="pn-cmp-duo">
        <div>
          <p className="pn-fl-l">Por hora</p>
          <ul>
            {comparison.events.map((row) => (
              <li key={row.eventId}>
                <b>{row.eventName}</b>
                <span>
                  Visitantes {num(row.normalized.uniqueVisitors)} · Aberturas{' '}
                  {num(row.normalized.profileViews)} · Ações{' '}
                  {num(
                    sumAnalyticsActions({
                      directionsOpened: row.normalized.directionsOpened,
                      phoneClicked: row.normalized.phoneClicked,
                      whatsappOpened: row.normalized.whatsappOpened
                    })
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="pn-fl-l">Ranking por conversão</p>
          <ol>
            {comparison.ranking.map((item) => (
              <li key={item.eventId}>
                <b>
                  {item.rank}. {item.eventName}
                </b>
                <span className="pn-mono">{conv(item.conversionRate)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {comparison.mode === 'advanced' ? (
        <div className="pn-cmp-duo">
          <div>
            <p className="pn-fl-l">Contra o histórico do bar</p>
            {history.length ? (
              <ul>
                {history.map((benchmark) => (
                  <li key={benchmark.metric}>
                    <b>{METRIC_LABEL[benchmark.metric]}</b>
                    <span>
                      {num(benchmark.current)} vs {num(benchmark.baseline)} no
                      histórico ({conv(benchmark.changePercent)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pn-hint">
                Ainda não há histórico suficiente para comparar.
              </p>
            )}
          </div>
          {comparison.insights.length ? (
            <div>
              <p className="pn-fl-l">Fora do normal</p>
              <ul>
                {comparison.insights.map((insight) => (
                  <li key={`${insight.eventId}-${insight.metric}`}>
                    <b>{insight.eventName}</b>
                    <span>
                      {METRIC_LABEL[insight.metric]} {num(insight.value)} vs{' '}
                      {num(insight.baseline)} na{' '}
                      {WEEKDAYS[insight.weekday] ?? 'semana'} (
                      {conv(insight.changePercent)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
