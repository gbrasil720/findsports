import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { cancelReasonLabel } from '@findsports_oficial/db/cancel-reasons'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type ReactNode, useState } from 'react'

import {
  BarLinks,
  BarTricks,
  SearchDriftAlert,
  STANDING_LABELS,
  searchDrift
} from '@/components/houdini/bar-tricks'
import {
  formatDate,
  formatDateTime,
  formatTime,
  initials
} from '@/components/houdini/format'
import { GrimorioRow } from '@/components/houdini/grimorio'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { appHref } from '@/lib/houdini-host'
import { countLabel } from '@/lib/plural'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/**
 * WEB-385: a ficha completa de um bar. Fica fora do aninhamento de Bares
 * (`bares_`): é página inteira, sem a lista ao lado.
 */
export const Route = createFileRoute('/houdini/_app/bares_/$barId')({
  head: () => ({ meta: [{ title: 'Ficha do bar — Houdini' }] }),
  component: FichaPage
})

type Ficha = inferRouterOutputs<AppRouter>['adminBars']['ficha']

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'reservas', label: 'Códigos' },
  { id: 'avaliacoes', label: 'Avaliações' },
  { id: 'grimorio', label: 'Grimório' }
] as const

type Tab = (typeof TABS)[number]['id']

const DAY = 24 * 3_600_000

/** Rascunho (WEB-436) só na aba Jogos, marcado: as contagens são do que está publicado. */
const publishedGames = (ficha: Ficha) => ficha.games.filter((g) => !g.draft)

function FichaPage() {
  const { env, admin } = Route.useRouteContext()
  const { barId } = Route.useParams()
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.adminBars.ficha.queryOptions({ barId }),
    meta: { errorToast: false }
  })
  const ficha = query.data

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        {query.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                query.error,
                'Não foi possível carregar a ficha.'
              )}
            </p>
          </div>
        ) : ficha ? (
          <FichaBody ficha={ficha} />
        ) : (
          <div className="hd-skeleton" style={{ height: 320 }} />
        )}
      </div>
    </HoudiniShell>
  )
}

function FichaBody({ ficha }: { ficha: Ficha }) {
  const [tab, setTab] = useState<Tab>('resumo')
  const counts: Partial<Record<Tab, number>> = {
    jogos: publishedGames(ficha).length,
    reservas: ficha.reservations.length,
    avaliacoes: ficha.ratingCount,
    grimorio: ficha.grimorio.length
  }
  const publicHref =
    typeof window === 'undefined'
      ? undefined
      : appHref(`/pub/${ficha.id}`, new URL(window.location.href))

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Bares', to: '/houdini/bares' }]}
        title={ficha.name}
        actions={<BarLinks bar={ficha} publicHref={publicHref} />}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <span
            className="hd-pill"
            data-tone={ficha.isActive ? 'acid' : undefined}
          >
            {ficha.isActive ? 'no ar' : 'fora do ar'}
          </span>
          <span
            className="hd-pill"
            data-tone={ficha.standing === 'current' ? 'stone' : 'live'}
          >
            {ficha.currentPlan ? PLAN_NAMES[ficha.currentPlan] : 'Sem plano'} ·{' '}
            {ficha.standing
              ? STANDING_LABELS[ficha.standing]
              : 'sem assinatura'}
          </span>
          <span className="hd-lead" style={{ fontSize: 14 }}>
            {ficha.neighborhood}, {ficha.city}
            {ficha.uf ? `/${ficha.uf}` : ''} · desde{' '}
            {formatDate(ficha.createdAt)}
          </span>
        </div>
        <span className="hd-mono hd-small" style={{ overflowWrap: 'anywhere' }}>
          id {ficha.id}
          {ficha.owner.stripeCustomerId
            ? ` · cliente Stripe ${ficha.owner.stripeCustomerId}`
            : ''}
        </span>
      </PageHead>

      <div role="tablist" aria-label="Seções da ficha" className="hd-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] !== undefined ? (
              <span className="n">{counts[t.id]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'resumo' ? <Resumo ficha={ficha} /> : null}
        {tab === 'jogos' ? (
          <Rows
            empty="Nenhum jogo por vir."
            rows={ficha.games.map((g) => ({
              id: g.id,
              main: g.title,
              tag: g.draft ? 'Rascunho' : undefined,
              sub: g.championship,
              right: `${formatDateTime(g.startsAt)} · ${countLabel(g.reservations, 'código', 'códigos')}`
            }))}
          />
        ) : null}
        {tab === 'reservas' ? (
          <Rows
            empty="Nenhum código."
            rows={ficha.reservations.map((r) => ({
              id: r.id,
              main: r.guestName,
              sub: `${r.gameTitle} · ${CODE_STATUS[r.status]}`,
              right: `jogo ${formatDateTime(r.startsAt)}`
            }))}
          />
        ) : null}
        {tab === 'avaliacoes' ? (
          <Rows
            empty="Ninguém avaliou ainda."
            rows={ficha.ratings.map((r) => ({
              id: r.id,
              main: r.wouldReturn ? 'Voltaria' : 'Não voltaria',
              sub: `${r.fanName} · ${r.gameTitle}`,
              right: formatDate(r.createdAt)
            }))}
          />
        ) : null}
        {tab === 'grimorio' ? (
          ficha.grimorio.length ? (
            <div className="hd-card" style={{ padding: '4px 20px', gap: 0 }}>
              {ficha.grimorio.map((entry) => (
                <GrimorioRow key={entry.id} entry={entry} compact />
              ))}
            </div>
          ) : (
            <p className="hd-empty">Nenhum truque neste bar ainda.</p>
          )
        ) : null}
      </div>
    </>
  )
}

/**
 * O código do balcão mora na antiga reserva: `confirmed` é o código em vigor
 * e `cancelled` o desmarcado. Pendente e recusado só existem em pedido de
 * antes de a reserva de mesa sair (16/10/2026).
 */
const CODE_STATUS: Record<Ficha['reservations'][number]['status'], string> = {
  confirmed: 'em vigor',
  cancelled: 'desmarcado',
  pending: 'pedido antigo',
  declined: 'pedido antigo recusado'
}

function Card({
  title,
  meta,
  children,
  gap = 14
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  gap?: number
}) {
  return (
    <section className="hd-card" style={{ gap }}>
      <div className="hd-card-hd">
        <h2 className="hd-h2">{title}</h2>
        {meta ? <span className="meta">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Resumo({ ficha }: { ficha: Ficha }) {
  const sub = ficha.subscription
  const games = publishedGames(ficha)
  const next = games[0]
  const daysToNext = next
    ? Math.max(
        0,
        Math.ceil((new Date(next.startsAt).getTime() - Date.now()) / DAY)
      )
    : null
  const stats = [
    {
      label: 'Jogos futuros',
      value: String(games.length),
      sub:
        daysToNext === null
          ? 'nenhum marcado'
          : daysToNext === 0
            ? 'próximo hoje'
            : `próximo em ${countLabel(daysToNext, 'dia', 'dias')}`
    },
    {
      label: 'Códigos em 30 dias',
      value: String(ficha.reservations30d.n),
      sub: 'de quem marcou que vai'
    },
    {
      label: 'Voltariam',
      value: ficha.ratingCount
        ? `${Math.round((ficha.ratingPositive / ficha.ratingCount) * 100)}%`
        : '—',
      sub: countLabel(ficha.ratingCount, 'avaliação', 'avaliações')
    }
  ]
  const signupTrial = sub?.status === 'trialing' && !sub.externalSubscriptionId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="hd-grid" aria-label="Números do bar">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`hd-card hd-kpi${i === stats.length - 1 ? ' is-hero' : ''}`}
          >
            <span className="lbl">{s.label}</span>
            <span className="num">{s.value}</span>
            <span className="sub">{s.sub}</span>
          </div>
        ))}
      </section>

      <div className="hd-cols">
        <div className="grow">
          <Card
            title="Assinatura"
            gap={16}
            meta={
              ficha.stripeUrl ? (
                <a href={ficha.stripeUrl} target="_blank" rel="noreferrer">
                  abrir no Stripe
                </a>
              ) : null
            }
          >
            <dl
              className="hd-dl"
              style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'
              }}
            >
              <div>
                <dt>Plano efetivo</dt>
                <dd>
                  {ficha.currentPlan
                    ? PLAN_NAMES[ficha.currentPlan]
                    : 'Sem plano'}
                </dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd
                  className="hd-mono"
                  style={{
                    fontSize: 13,
                    color:
                      ficha.standing && ficha.standing !== 'current'
                        ? 'var(--hd-live-text)'
                        : undefined
                  }}
                >
                  {sub
                    ? `${PLAN_NAMES[sub.plan]} · ${sub.status}`
                    : 'sem assinatura'}
                </dd>
              </div>
              <div>
                <dt>Fim do período</dt>
                <dd>
                  {sub?.currentPeriodEnd
                    ? formatDateTime(sub.currentPeriodEnd)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Teste do cadastro</dt>
                <dd>
                  {signupTrial
                    ? ficha.standing === 'current'
                      ? 'em andamento'
                      : 'vencido'
                    : sub?.externalSubscriptionId
                      ? 'assina pelo Stripe'
                      : '—'}
                </dd>
              </div>
              {sub?.cancelAt ? (
                <div>
                  <dt>Cancela em</dt>
                  <dd>{formatDateTime(sub.cancelAt)}</dd>
                </div>
              ) : null}
              {ficha.cancelReason ? (
                <div>
                  <dt>Motivo do cancelamento</dt>
                  <dd>
                    {cancelReasonLabel(ficha.cancelReason.reason)}
                    <span
                      className="hd-mono hd-small"
                      style={{ display: 'block' }}
                    >
                      {PLAN_NAMES[ficha.cancelReason.plan]} ·{' '}
                      {formatDateTime(ficha.cancelReason.createdAt)}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
            {searchDrift(ficha) ? (
              <SearchDriftAlert key={ficha.id} bar={ficha} />
            ) : (
              <div className="hd-done">
                <Icon name="check" size={16} />
                Busca e plano batem: {PLAN_NAMES[ficha.barPlan]} na busca.
              </div>
            )}
          </Card>

          <Card title="Próximos jogos" gap={4}>
            {games.length ? (
              <div>
                {games.slice(0, 3).map((g) => (
                  <div
                    key={g.id}
                    className="hd-row"
                    style={{ gap: 16, padding: '12px 0', flexWrap: 'wrap' }}
                  >
                    <span
                      style={{
                        flex: '0 0 70px',
                        font: '400 28px/1 var(--hd-display)'
                      }}
                    >
                      {formatTime(g.startsAt)}
                    </span>
                    <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <b style={{ display: 'block', fontSize: 15 }}>
                        {g.title}
                      </b>
                      <span className="hd-small">
                        {[g.championship, formatDate(g.startsAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span
                      className="hd-mono"
                      style={{ marginLeft: 'auto', fontWeight: 600 }}
                    >
                      {countLabel(g.reservations, 'código', 'códigos')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hd-small" style={{ margin: 0 }}>
                Nenhum jogo por vir.
              </p>
            )}
          </Card>
        </div>

        <div className="side">
          <Card
            title="Dono"
            meta={
              <Link
                to="/houdini/pessoas/$userId"
                params={{ userId: ficha.owner.id }}
              >
                abrir a ficha
              </Link>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="hd-avatar">{initials(ficha.owner.name)}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}>{ficha.owner.name}</b>
                <span
                  className="hd-mono hd-small"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {ficha.owner.email}
                </span>
              </span>
            </div>
            <dl className="hd-dl">
              <div>
                <dt>E-mail</dt>
                <dd>
                  {ficha.owner.emailVerified ? 'verificado' : 'não verificado'}
                </dd>
              </div>
              <div>
                <dt>Conta</dt>
                <dd>{ficha.owner.banned ? 'sumida' : 'ativa'}</dd>
              </div>
              <div>
                <dt>Telefone do bar</dt>
                <dd className="hd-mono">{ficha.phone ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Truques" meta="vão para o Grimório">
            <BarTricks key={ficha.id} bar={ficha} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function Rows({
  rows,
  empty
}: {
  rows: Array<{
    id: string
    main: string
    sub: string
    right: string
    tag?: string
  }>
  empty: string
}) {
  if (!rows.length) return <p className="hd-empty">{empty}</p>
  return (
    <section
      className="hd-card"
      style={{ padding: 0, overflow: 'hidden', gap: 0 }}
    >
      {rows.map((r, i) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 14,
            minHeight: 60,
            padding: '10px 18px',
            borderTop: i ? '1px solid var(--hd-line)' : undefined
          }}
        >
          <span
            style={{
              flex: '1 1 260px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {/* Flex com gap, e não margem: quando a etiqueta desce de linha,
                ela começa rente ao título, sem recuo. */}
            <span
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '4px 8px',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              <span style={{ minWidth: 0 }}>{r.main}</span>
              {r.tag ? <span className="hd-pill">{r.tag}</span> : null}
            </span>
            <span style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
              {r.sub}
            </span>
          </span>
          <span
            className="hd-mono"
            style={{ fontSize: 12, color: 'var(--hd-body)' }}
          >
            {r.right}
          </span>
        </div>
      ))}
    </section>
  )
}
