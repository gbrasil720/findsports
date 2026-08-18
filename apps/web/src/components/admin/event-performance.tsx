import { useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Check from 'reicon-react/icons/Check'
import ChevronDown from 'reicon-react/icons/ChevronDown'
import {
  type EventAnalyticsRow,
  formatRate,
  getMainAction
} from './admin-model'
import { getMetric } from './metric-glossary'
import { MetricHint } from './metric-hint'

/** Título da seção com o ⓘ do glossário ao lado. */
function PerformanceHeading() {
  return (
    <h3 className="onside-heading mb-3">
      {getMetric('eventPerformance').label}
      <MetricHint metric="eventPerformance" />
    </h3>
  )
}

function formatEventDate(startsAt: string): string {
  const d = new Date(startsAt)
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short'
  })
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function PerformanceSkeleton() {
  return (
    <div className="onside-panel-acid p-4">
      <h3 className="onside-heading mb-3">
        {getMetric('eventPerformance').label}
      </h3>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-12 w-full rounded-sm bg-[var(--onside-paper)] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

function PerformanceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="onside-callout onside-callout-danger" role="alert">
      <AlertCircle
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <p className="flex-1">
        Não foi possível carregar o desempenho dos jogos.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="onside-btn onside-btn-ink shrink-0"
      >
        Tentar novamente
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Event Row                                                           */
/* ------------------------------------------------------------------ */

/**
 * Trilha de colunas compartilhada pelo cabeçalho e pelas linhas — é o que
 * mantém os números alinhados sem repetir o rótulo em cada linha.
 *
 * No celular só sobra "Interesse": as outras duas colunas não cabem sem
 * espremer o nome do jogo, e o detalhe completo já está no painel expandido.
 */
const ROW_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_4.25rem] items-center gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_repeat(3,4.25rem)]'

function PerformanceColumns() {
  return (
    <div
      className={`${ROW_GRID} border-[var(--onside-line)] border-b pb-1.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-ink)] uppercase tracking-[0.1em] opacity-50`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span className="hidden text-right sm:block">Aberturas</span>
      <span className="text-right">Interesse</span>
      <span className="hidden text-right sm:block">Taxa</span>
    </div>
  )
}

function EventPerformanceRow({ item }: { item: EventAnalyticsRow }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = `event-performance-${item.eventId}`
  const intentActions =
    (item.whatsappOpened ?? 0) +
    (item.directionsOpened ?? 0) +
    (item.phoneClicked ?? 0)

  return (
    <div className="border-b border-[var(--onside-line)] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`${ROW_GRID} w-full py-2.5 text-left transition-colors hover:bg-[var(--onside-paper)]/50`}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <ChevronDown
          size={16}
          color="var(--onside-ink)"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />

        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-[var(--onside-ink)] text-sm">
            {item.eventName}
          </span>
          <span className="shrink-0 text-[var(--onside-ink)] text-xs opacity-60">
            {formatEventDate(item.startsAt)}
          </span>
        </span>

        {/* O cabeçalho é só alinhamento visual, então cada número carrega o
            próprio rótulo pra leitor de tela. */}
        <span className="hidden text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums sm:block">
          <span className="sr-only">Aberturas: </span>
          {item.profileViews}
        </span>
        <span className="text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums">
          <span className="sr-only">Interesse: </span>
          {intentActions}
        </span>
        <span className="hidden text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums sm:block">
          <span className="sr-only">Taxa: </span>
          {formatRate(intentActions, item.profileViews)}
        </span>
      </button>

      {/* Altura animada por grid-template-rows: 0fr → 1fr anima sem precisar
          medir o conteúdo. `prefers-reduced-motion` já derruba tudo que casa
          com `[class*="transition"]` dentro de `.onside-app`. */}
      <div
        id={panelId}
        aria-hidden={!expanded}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 pl-8 text-[var(--onside-ink)] text-sm opacity-80 sm:grid-cols-4">
            <div>
              <dt className="text-xs opacity-60">WhatsApp</dt>
              <dd className="font-medium tabular-nums">
                {item.whatsappOpened ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Rota</dt>
              <dd className="font-medium tabular-nums">
                {item.directionsOpened ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Telefone</dt>
              <dd className="font-medium tabular-nums">
                {item.phoneClicked ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Mais usado</dt>
              <dd className="font-medium">{getMainAction(item) ?? '—'}</dd>
            </div>
          </dl>

          {/* No celular as colunas de aberturas e taxa saem do cabeçalho;
              aqui elas reaparecem pra não sumir a informação. */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 pl-8 text-[var(--onside-ink)] text-sm opacity-80 sm:hidden">
            <div>
              <dt className="text-xs opacity-60">Aberturas</dt>
              <dd className="font-medium tabular-nums">{item.profileViews}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Taxa</dt>
              <dd className="font-medium tabular-nums">
                {formatRate(intentActions, item.profileViews)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function EventPerformance({
  eventAnalyticsState
}: {
  eventAnalyticsState: {
    status: 'loading' | 'error' | 'empty' | 'ready'
    items?: EventAnalyticsRow[]
    retry?: () => void
  }
}) {
  if (eventAnalyticsState.status === 'loading') return <PerformanceSkeleton />
  if (eventAnalyticsState.status === 'error' && eventAnalyticsState.retry)
    return <PerformanceError onRetry={eventAnalyticsState.retry} />

  if (eventAnalyticsState.status === 'empty') {
    return (
      <div className="onside-panel-acid p-4">
        <PerformanceHeading />
        <p className="text-sm text-[var(--onside-ink)] opacity-60">
          Os números aparecem quando torcedores chegarem ao seu bar pelos jogos
          que você cadastrou.
        </p>
      </div>
    )
  }

  if (eventAnalyticsState.status !== 'ready' || !eventAnalyticsState.items)
    return null

  const items = eventAnalyticsState.items

  const topEvent = items.reduce<EventAnalyticsRow | null>((best, item) => {
    const intent =
      (item.whatsappOpened ?? 0) +
      (item.directionsOpened ?? 0) +
      (item.phoneClicked ?? 0)
    const bestIntent =
      (best?.whatsappOpened ?? 0) +
      (best?.directionsOpened ?? 0) +
      (best?.phoneClicked ?? 0)
    return !best || intent > bestIntent ? item : best
  }, null)

  const topEventIntent =
    (topEvent?.whatsappOpened ?? 0) +
    (topEvent?.directionsOpened ?? 0) +
    (topEvent?.phoneClicked ?? 0)

  return (
    <div className="onside-panel-acid p-4">
      <PerformanceHeading />

      {topEvent && (
        <div className="mb-3 flex items-center gap-2 border border-[var(--onside-ink)] bg-[var(--onside-ink)] px-3 py-2 text-sm text-[var(--onside-paper)]">
          <Check size={14} color="currentColor" aria-hidden="true" />
          Melhor jogo: {topEvent.eventName} ({topEventIntent}{' '}
          {topEventIntent === 1 ? 'interessado' : 'interessados'})
        </div>
      )}

      <PerformanceColumns />
      <div>
        {items.map((item) => (
          <EventPerformanceRow key={item.eventId} item={item} />
        ))}
      </div>
    </div>
  )
}
