import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'

import {
  BarLinks,
  BarTricks,
  SearchDriftAlert,
  STANDING_LABELS,
  searchDrift
} from '@/components/houdini/bar-tricks'
import { formatDate, formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
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
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Gente e bares"
          title="Bares"
          titleId="bares-h"
          summary={
            <>
              “Plano” é o que o app aplica agora. “Busca” é a cópia em{' '}
              <code className="hd-mono">bar.plan</code>, que ordena a busca e
              pode atrasar até um dia. Quando as duas divergem, a linha avisa.
            </>
          }
        />
        <label className="hd-search">
          <Icon name="search" size={18} />
          <span className="hd-sr">Buscar bar</span>
          <input
            type="search"
            className="hd-input"
            placeholder="Buscar por nome do bar, e-mail do dono ou id..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <div className="hd-cols">
          <section className="grow" aria-labelledby="bares-h">
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
                          <div
                            className="hd-skeleton"
                            style={{ height: 160 }}
                          />
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
                              data-tone={bar.isActive ? 'acid' : undefined}
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
                                    ? 'var(--hd-sand-text)'
                                    : 'var(--hd-muted)',
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

          <aside className="hd-card hd-aside side" aria-label="Bar escolhido">
            {picked ? (
              <BarPanel bar={picked} />
            ) : (
              <p className="hd-empty">Escolha um bar na lista.</p>
            )}
          </aside>
        </div>
      </div>
    </HoudiniShell>
  )
}

function BarPanel({ bar }: { bar: Bar }) {
  const sub = bar.subscription
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="hd-eyebrow">Bar escolhido</span>
        <h2 className="hd-h1 is-sm">{bar.name}</h2>
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

      <SearchDriftAlert key={bar.id} bar={bar} />

      <BarLinks key={bar.id} bar={bar} showFicha stacked />
      <hr className="hd-rule" />
      <span className="hd-h2">Truques</span>
      <BarTricks key={bar.id} bar={bar} />
      <p className="hd-note">
        <Icon name="book" size={16} />
        Tudo o que se faz aqui vai para o Grimório.
      </p>
    </>
  )
}
