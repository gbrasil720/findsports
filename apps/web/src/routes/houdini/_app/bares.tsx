import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'

import { formatDate, formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
import { LAPSED_COPY } from '@/lib/lapsed-plan'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/bares')({
  head: () => ({ meta: [{ title: 'Bares — Houdini' }] }),
  // `?bar=<id>` vem do ⌘K: abre com a busca no id, e a ficha já aberta.
  // Outro resultado do ⌘K, com a página aberta, remonta com o novo id.
  validateSearch: (search: Record<string, unknown>): { bar?: string } =>
    typeof search.bar === 'string' ? { bar: search.bar } : {},
  remountDeps: ({ search }) => search.bar,
  component: BaresPage
})

type Bar = inferRouterOutputs<AppRouter>['adminBars']['list']['bars'][number]

const STANDING_LABELS: Record<SubscriptionStanding, string> = {
  current: 'em dia',
  past_due: LAPSED_COPY.past_due.label,
  trial_ended: LAPSED_COPY.trial_ended.label,
  ended: 'encerrada'
}

/** A busca ordena por `bar.plan`, que pode atrasar até um dia (WEB-129). */
function searchDrift(bar: Bar) {
  return bar.currentPlan !== null && bar.currentPlan !== bar.barPlan
}

function BaresPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const { bar: fromPalette } = Route.useSearch()
  const [search, setSearch] = useState(fromPalette ?? '')
  const [page, setPage] = useState(1)
  const [pickedId, setPickedId] = useState<string | null>(fromPalette ?? null)

  const query = useQuery({
    ...trpc.adminBars.list.queryOptions({
      search: search.trim() || undefined,
      page
    }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const bars = query.data?.bars ?? []
  const picked = bars.find((b) => b.id === pickedId) ?? bars[0] ?? null
  const lastPage = Math.max(
    1,
    Math.ceil((query.data?.matched ?? 0) / (query.data?.pageSize ?? 1))
  )

  return (
    <HoudiniShell title="Bares" env={env} user={admin}>
      <div className="hd-split">
        <section className="hd-page" aria-labelledby="bares-h">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 id="bares-h" className="hd-h1">
              Bares
            </h1>
            <p className="hd-lead" style={{ fontSize: 13 }}>
              “Plano” é o que o app aplica agora. “Busca” é a cópia em{' '}
              <code className="hd-mono">bar.plan</code>, que ordena a busca e
              pode atrasar até um dia. Quando as duas divergem, a linha avisa.
            </p>
          </div>
          <label htmlFor="hd-busca-bar" className="hd-sr">
            Buscar bar
          </label>
          <input
            id="hd-busca-bar"
            type="search"
            className="hd-input"
            placeholder="Buscar por nome do bar, e-mail do dono ou id..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />

          {query.isError ? (
            <div className="hd-card" role="alert">
              <p style={{ margin: 0 }}>
                {getUserFacingMessage(
                  query.error,
                  'Não foi possível carregar os bares.'
                )}
              </p>
            </div>
          ) : (
            <div className="hd-table-wrap" aria-busy={query.isFetching}>
              <table className="hd-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th scope="col">Bar</th>
                    <th scope="col">No ar</th>
                    <th scope="col">Plano</th>
                    <th scope="col">Stripe</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Jogos futuros
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="hd-skeleton" style={{ height: 160 }} />
                      </td>
                    </tr>
                  ) : bars.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="hd-empty">
                        Nenhum bar encontrado.
                      </td>
                    </tr>
                  ) : (
                    bars.map((bar) => (
                      <tr key={bar.id} aria-selected={bar.id === picked?.id}>
                        <td>
                          <button
                            type="button"
                            className="hd-cell-btn"
                            onClick={() => setPickedId(bar.id)}
                          >
                            {bar.name}
                            <span className="hd-sub">{bar.ownerEmail}</span>
                          </button>
                        </td>
                        <td>
                          <span
                            className="hd-pill"
                            data-tone={bar.isActive ? 'ok' : undefined}
                          >
                            {bar.isActive ? 'no ar' : 'fora do ar'}
                          </span>
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {bar.currentPlan
                                ? PLAN_NAMES[bar.currentPlan]
                                : 'Sem plano'}{' '}
                              <span
                                style={{
                                  fontWeight: 400,
                                  color: 'var(--hd-muted)'
                                }}
                              >
                                ·{' '}
                                {bar.standing
                                  ? STANDING_LABELS[bar.standing]
                                  : 'sem assinatura'}
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: searchDrift(bar)
                                  ? 'var(--hd-warn)'
                                  : 'var(--hd-faint)',
                                fontWeight: searchDrift(bar) ? 600 : 400
                              }}
                            >
                              {searchDrift(bar)
                                ? `busca ainda em ${PLAN_NAMES[bar.barPlan]}`
                                : `busca: ${PLAN_NAMES[bar.barPlan]}`}
                            </span>
                          </div>
                        </td>
                        <td className="hd-mono" style={{ fontSize: 12 }}>
                          {bar.subscription?.provider === 'stripe'
                            ? `${bar.subscription.plan} · ${bar.subscription.status}`
                            : 'sem assinatura'}
                        </td>
                        <td
                          className="hd-mono"
                          style={{ fontSize: 12, textAlign: 'right' }}
                        >
                          {bar.upcomingGames}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {lastPage > 1 ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="hd-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="hd-mono hd-small">
                {page} / {lastPage}
              </span>
              <button
                type="button"
                className="hd-btn"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </section>

        <aside className="hd-aside" aria-label="Bar escolhido">
          {picked ? (
            <BarPanel bar={picked} />
          ) : (
            <p className="hd-empty">Escolha um bar na lista.</p>
          )}
        </aside>
      </div>
    </HoudiniShell>
  )
}

function BarPanel({ bar }: { bar: Bar }) {
  const sub = bar.subscription
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 className="hd-h1" style={{ fontSize: 18 }}>
          {bar.name}
        </h2>
        <span className="hd-mono hd-small" style={{ overflowWrap: 'anywhere' }}>
          {bar.ownerEmail} · id {bar.id}
        </span>
      </div>
      <dl className="hd-dl">
        <div>
          <dt>Plano</dt>
          <dd>{bar.currentPlan ? PLAN_NAMES[bar.currentPlan] : 'Sem plano'}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>
            {bar.standing ? STANDING_LABELS[bar.standing] : 'sem assinatura'}
          </dd>
        </div>
        <div>
          <dt>Fim do período</dt>
          <dd>
            {sub?.currentPeriodEnd ? formatDateTime(sub.currentPeriodEnd) : '—'}
          </dd>
        </div>
        <div>
          <dt>Cadastro</dt>
          <dd>{formatDate(bar.createdAt)}</dd>
        </div>
        {bar.cancelAt ? (
          <div>
            <dt>Cancela em</dt>
            <dd>{formatDateTime(bar.cancelAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Dono</dt>
          <dd>{bar.ownerName}</dd>
        </div>
      </dl>

      {searchDrift(bar) ? (
        <div className="hd-alert" role="status">
          <span className="hd-alert-title">
            <Icon name="warn" size={16} strokeWidth={1.8} />
            Busca desatualizada
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--hd-soft)'
            }}
          >
            O plano é {bar.currentPlan ? PLAN_NAMES[bar.currentPlan] : '—'}, mas
            a busca ainda ordena este bar como {PLAN_NAMES[bar.barPlan]}. A
            reconciliação diária arruma em até 24 h.
          </p>
        </div>
      ) : null}

      {bar.stripeUrl ? (
        <a
          className="hd-btn"
          href={bar.stripeUrl}
          target="_blank"
          rel="noreferrer"
          style={{ justifyContent: 'flex-start' }}
        >
          <Icon name="external" size={16} strokeWidth={1.8} />
          Abrir no Stripe
        </a>
      ) : null}
    </>
  )
}
