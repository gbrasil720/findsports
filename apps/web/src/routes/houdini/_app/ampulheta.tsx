import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { formatDate, formatDateTime } from '@/components/houdini/format'
import { HoudiniShell } from '@/components/houdini/shell'
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

function columnLabel(day: number) {
  if (day === 0) return 'Hoje'
  if (day === 1) return 'Amanhã'
  return `Em ${day} dias`
}

function venceu(daysAgo: number) {
  if (daysAgo <= 0) return 'venceu hoje'
  if (daysAgo === 1) return 'venceu ontem'
  return `venceu há ${daysAgo} dias`
}

const barLink = { fontSize: 13, fontWeight: 600, textDecoration: 'none' }

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
  const columns = Array.from({ length: 7 }, (_, day) => ({
    day,
    date: formatDate(new Date(now + day * DAY)).slice(0, 5),
    bars: data.data?.ending.filter((b) => b.day === day) ?? []
  }))
  const gone = data.data?.gone ?? []

  return (
    <HoudiniShell title="Ampulheta" env={env} user={admin}>
      <div className="hd-page" style={{ maxWidth: 1280 }}>
        <div className="hd-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="hd-h1">Ampulheta</h1>
            <p className="hd-lead" style={{ maxWidth: 640 }}>
              Testes do cadastro que acabam nos próximos 7 dias. Sem assinatura
              no Stripe, a reconciliação diária tira o bar do ar até um dia
              depois do fim.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap'
            }}
          >
            <span className="hd-small" style={{ color: 'var(--hd-muted)' }}>
              Estender por
            </span>
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
        </div>

        {data.isError ? (
          <p className="hd-empty" role="alert">
            Não foi possível ler a Ampulheta.
          </p>
        ) : null}

        <div
          className="hd-grid"
          style={{ '--hd-min': '150px', gap: 8 } as never}
        >
          {columns.map((column) => (
            <section
              key={column.day}
              aria-label={columnLabel(column.day)}
              className="hd-card"
              style={{
                gap: 8,
                minHeight: 'clamp(96px, 24vw, 220px)',
                padding: 12,
                borderColor:
                  column.day === 0 ? 'rgb(255 92 122 / 0.4)' : undefined
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8
                }}
              >
                <h2 className="hd-h2" style={{ fontWeight: 700, fontSize: 13 }}>
                  {columnLabel(column.day)}
                </h2>
                <span className="hd-sub">{column.date}</span>
              </div>
              {column.bars.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 10,
                    borderRadius: 10,
                    background: '#1b1922',
                    border: '1px solid rgb(255 255 255 / 0.06)'
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    <Link
                      to="/houdini/bares/$barId"
                      params={{ barId: b.id }}
                      style={barLink}
                    >
                      {b.name}
                    </Link>
                    <span className="hd-sub">
                      {b.currentPlan ? PLAN_NAMES[b.currentPlan] : 'venceu'} ·{' '}
                      {plural(b.upcomingGames, 'jogo', 'jogos')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="hd-btn hd-btn-soft"
                    disabled={extend.isPending}
                    onClick={() => extend.mutate({ barId: b.id, days })}
                  >
                    {pending(b.id) ? 'Estendendo…' : `+${days} dias`}
                  </button>
                </div>
              ))}
              {data.isSuccess && column.bars.length === 0 ? (
                <span className="hd-small">nenhum</span>
              ) : null}
            </section>
          ))}
        </div>

        <section className="hd-card" aria-labelledby="vencidos-h">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8,
              flexWrap: 'wrap'
            }}
          >
            <h2 id="vencidos-h" className="hd-h2">
              Saíram do ar nos últimos 7 dias
            </h2>
            <span className="hd-small" style={{ color: 'var(--hd-muted)' }}>
              teste vencido, sem assinatura
            </span>
          </div>
          {data.isSuccess && gone.length === 0 ? (
            <p className="hd-small" style={{ margin: 0 }}>
              Nenhum bar saiu do ar por teste vencido nesta semana.
            </p>
          ) : null}
          {gone.map((b) => (
            <div
              key={b.id}
              className="hd-row"
              style={{ minHeight: 52, flexWrap: 'wrap' }}
            >
              <span
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1
                }}
              >
                <Link
                  to="/houdini/bares/$barId"
                  params={{ barId: b.id }}
                  style={barLink}
                >
                  {b.name}
                </Link>
                <span className="hd-sub">
                  {venceu(b.daysAgo)} · era {PLAN_NAMES[b.plan]} em teste ·{' '}
                  {plural(b.upcomingGames, 'jogo', 'jogos')}
                </span>
              </span>
              <button
                type="button"
                className="hd-btn hd-btn-soft"
                style={{ padding: '0 12px' }}
                disabled={extend.isPending}
                onClick={() => extend.mutate({ barId: b.id, days })}
              >
                {pending(b.id) ? 'Religando…' : `Religar por ${days} dias`}
              </button>
            </div>
          ))}
        </section>
      </div>
    </HoudiniShell>
  )
}
