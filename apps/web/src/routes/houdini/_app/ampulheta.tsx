import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { formatDate, formatDateTime } from '@/components/houdini/format'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/ampulheta')({
  head: () => ({ meta: [{ title: 'Ampulheta — Houdini' }] }),
  component: AmpulhetaPage
})

const DAYS = [7, 14, 30] as const
const DAY = 86_400_000

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** "Hoje", "Amanhã", depois o dia da semana ("Sáb"), em Brasília. */
function columnLabel(day: number, date: Date) {
  if (day === 0) return 'Hoje'
  if (day === 1) return 'Amanhã'
  const weekday = date
    .toLocaleDateString('pt-BR', {
      weekday: 'short',
      timeZone: BRASILIA_TIME_ZONE
    })
    .replace('.', '')
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`
}

function venceu(daysAgo: number) {
  if (daysAgo <= 0) return 'venceu hoje'
  if (daysAgo === 1) return 'venceu ontem'
  return `venceu há ${daysAgo} dias`
}

/**
 * WEB-386: o teste do cadastro vence e a reconciliação tira o bar do ar sem
 * ninguém ver. Aqui fica a semana que vem, coluna por dia, e quem já saiu.
 * Estender e religar são o mesmo `adminBars.extendTrial`, que religa o bar
 * com o teste vencido e fica no Grimório.
 */
function AmpulhetaPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [days, setDays] = useState<(typeof DAYS)[number]>(14)
  const data = useQuery(trpc.houdini.ampulheta.queryOptions())

  const extend = useMutation(
    trpc.adminBars.extendTrial.mutationOptions({
      onSuccess: async (result, input) => {
        const back = data.data?.gone.some((b) => b.id === input.barId)
        toast.success(
          `Teste até ${result.currentPeriodEnd ? formatDateTime(result.currentPeriodEnd) : '—'}.${back ? ' O bar voltou ao ar.' : ''}`
        )
        await Promise.all(
          [trpc.houdini, trpc.adminBars, trpc.grimorio].map((r) =>
            queryClient.invalidateQueries({ queryKey: r.pathKey() })
          )
        )
      },
      // A recusa do servidor diz por que não cabe (assinou no Stripe, mudou
      // agora há pouco); a genérica esconderia.
      onError: (error) =>
        toast.error(
          error.data?.code === 'PRECONDITION_FAILED' ||
            error.data?.code === 'CONFLICT'
            ? error.message
            : getUserFacingMessage(error, 'Não foi possível estender o teste.')
        )
    })
  )
  const pending = (barId: string) =>
    extend.isPending && extend.variables?.barId === barId

  const now = Date.now()
  const columns = Array.from({ length: 7 }, (_, day) => {
    const date = new Date(now + day * DAY)
    return {
      day,
      label: columnLabel(day, date),
      date: formatDate(date).slice(0, 5),
      bars: data.data?.ending.filter((b) => b.day === day) ?? []
    }
  })
  const gone = data.data?.gone ?? []

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Pede atenção"
          title="Ampulheta"
          summary={
            <>
              {data.data ? (
                <b>{plural(data.data.ending.length, 'teste', 'testes')}</b>
              ) : (
                'Testes'
              )}{' '}
              do cadastro acabam nos próximos 7 dias. Sem assinatura no Stripe,
              a reconciliação tira o bar do ar até um dia depois do fim.
            </>
          }
          actions={
            <div
              className="hd-label"
              style={{ alignItems: 'flex-end', fontWeight: 400 }}
            >
              <span className="hd-eyebrow">Estender por</span>
              <fieldset className="hd-seg" aria-label="Quanto estender">
                {DAYS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={days === n}
                    onClick={() => setDays(n)}
                  >
                    {n} dias
                  </button>
                ))}
              </fieldset>
            </div>
          }
        />

        {data.isError ? (
          <p className="hd-empty" role="alert">
            Não foi possível ler a Ampulheta.
          </p>
        ) : null}

        <div
          style={{
            overflowX: 'auto',
            overscrollBehaviorX: 'contain',
            padding: '2px 6px 8px 2px'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(158px, 1fr))',
              gap: 12,
              minWidth: 1150
            }}
          >
            {columns.map((column) => (
              <section
                key={column.day}
                aria-label={column.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  minWidth: 0,
                  padding: 12,
                  borderRadius: 7,
                  ...(column.day === 0
                    ? {
                        background: 'var(--hd-live-tint)',
                        boxShadow: 'inset 0 0 0 1.5px var(--hd-live)'
                      }
                    : {
                        background: 'var(--hd-card-2)',
                        boxShadow: 'inset 0 0 0 1px var(--hd-line)'
                      })
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '2px 2px 8px',
                    borderBottom: '1px solid var(--hd-line)'
                  }}
                >
                  <h2
                    style={{
                      font: '400 22px/1 var(--hd-display)',
                      textTransform: 'uppercase'
                    }}
                  >
                    {column.label}
                  </h2>
                  <span className="hd-mono hd-small">{column.date}</span>
                </div>
                {column.bars.map((b) => (
                  <div
                    key={b.id}
                    className="hd-card"
                    style={{ padding: 12, gap: 8 }}
                  >
                    <Link
                      to="/houdini/bares/$barId"
                      params={{ barId: b.id }}
                      style={{ fontWeight: 700, fontSize: 14.5 }}
                    >
                      {b.name}
                    </Link>
                    <span className="hd-small">
                      {b.currentPlan ? PLAN_NAMES[b.currentPlan] : 'venceu'} ·{' '}
                      {b.upcomingGames
                        ? plural(b.upcomingGames, 'jogo', 'jogos')
                        : 'nenhum jogo'}
                    </span>
                    <button
                      type="button"
                      className={
                        column.day === 0
                          ? 'hd-btn hd-btn-primary is-sm'
                          : 'hd-btn is-sm'
                      }
                      disabled={extend.isPending}
                      onClick={() => extend.mutate({ barId: b.id, days })}
                    >
                      {pending(b.id) ? 'Estendendo…' : `+${days} dias`}
                    </button>
                  </div>
                ))}
                {data.isSuccess && column.bars.length === 0 ? (
                  <p
                    className="hd-empty is-dashed"
                    style={{ padding: '16px 4px' }}
                  >
                    nenhum
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </div>

        <section
          className="hd-card"
          aria-labelledby="vencidos-h"
          style={{ gap: 4 }}
        >
          <div className="hd-card-hd" style={{ marginBottom: 6 }}>
            <h2 id="vencidos-h" className="hd-h2">
              Saíram do ar nos últimos 7 dias
            </h2>
            <span className="meta">teste vencido, sem assinatura</span>
          </div>
          {data.isSuccess && gone.length === 0 ? (
            <p className="hd-small" style={{ margin: 0 }}>
              Nenhum bar saiu do ar por teste vencido nesta semana.
            </p>
          ) : null}
          <div>
            {gone.map((b) => (
              <div key={b.id} className="hd-row" style={{ flexWrap: 'wrap' }}>
                <span className="hd-dot" data-tone="muted" />
                <span className="what">
                  <Link to="/houdini/bares/$barId" params={{ barId: b.id }}>
                    <b>{b.name}</b>
                  </Link>{' '}
                  · {venceu(b.daysAgo)} · era {PLAN_NAMES[b.plan]} em teste ·{' '}
                  {b.upcomingGames
                    ? plural(b.upcomingGames, 'jogo', 'jogos')
                    : 'nenhum jogo'}
                </span>
                <button
                  type="button"
                  className="hd-btn is-sm"
                  disabled={extend.isPending}
                  onClick={() => extend.mutate({ barId: b.id, days })}
                >
                  {pending(b.id) ? 'Religando…' : `Religar por ${days} dias`}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </HoudiniShell>
  )
}
