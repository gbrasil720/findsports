import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { cancelReasonLabel } from '@findsports_oficial/db/cancel-reasons'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type ReactNode, useState } from 'react'

import {
  BarTricks,
  SearchDriftAlert,
  STANDING_LABELS,
  searchDrift
} from '@/components/houdini/bar-tricks'
import { formatDate, formatDateTime } from '@/components/houdini/format'
import { GrimorioRow } from '@/components/houdini/grimorio'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
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
    <HoudiniShell
      title={ficha?.name ?? 'Ficha'}
      crumbs={[{ label: 'Bares', to: '/houdini/bares' }]}
      env={env}
      user={admin}
    >
      <div className="hd-page" style={{ gap: 24 }}>
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
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'flex-start',
          justifyContent: 'space-between'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            minWidth: 0
          }}
        >
          <span
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'var(--hd-raise)',
              color: 'var(--hd-soft)'
            }}
          >
            <Icon name="store" size={28} strokeWidth={1.6} />
          </span>
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <h1 className="hd-h1" style={{ fontSize: 28 }}>
              {ficha.name}
            </h1>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center'
              }}
            >
              <span
                className="hd-pill"
                data-tone={ficha.isActive ? 'ok' : undefined}
              >
                {ficha.isActive ? 'no ar' : 'fora do ar'}
              </span>
              <span className="hd-pill" data-tone="roxo">
                {ficha.currentPlan
                  ? PLAN_NAMES[ficha.currentPlan]
                  : 'Sem plano'}{' '}
                ·{' '}
                {ficha.standing
                  ? STANDING_LABELS[ficha.standing]
                  : 'sem assinatura'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--hd-muted)' }}>
                {ficha.neighborhood}, {ficha.city}
                {ficha.uf ? `/${ficha.uf}` : ''} · desde{' '}
                {formatDate(ficha.createdAt)}
              </span>
            </div>
            <span
              className="hd-mono hd-small"
              style={{ overflowWrap: 'anywhere' }}
            >
              id {ficha.id}
              {ficha.owner.stripeCustomerId
                ? ` · cliente Stripe ${ficha.owner.stripeCustomerId}`
                : ''}
            </span>
          </div>
        </div>
        <BarTricks key={ficha.id} bar={ficha} inline publicHref={publicHref} />
      </section>

      <div
        role="tablist"
        aria-label="Seções da ficha"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          borderBottom: '1px solid var(--hd-line)'
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 14px',
              border: 0,
              background: 'transparent',
              font: '600 13px var(--hd-sans)',
              cursor: 'pointer',
              marginBottom: -1,
              color: tab === t.id ? 'var(--hd-text)' : 'var(--hd-muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--hd-roxo)' : 'transparent'}`
            }}
          >
            {t.label}
            {counts[t.id] !== undefined ? (
              <span className="hd-mono" style={{ fontSize: 11 }}>
                {counts[t.id]}
              </span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ficha.grimorio.map((entry) => (
                <GrimorioRow key={entry.id} entry={entry} />
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
  children,
  gap = 14
}: {
  title: string
  children: ReactNode
  gap?: number
}) {
  return (
    <section className="hd-card" style={{ gap }}>
      <h2 className="hd-h2">{title}</h2>
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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-start'
      }}
    >
      <div
        style={{
          flex: '3 1 480px',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div className="hd-grid" style={{ ['--hd-min' as string]: '150px' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              className="hd-card"
              style={{ padding: 16, gap: 6 }}
            >
              <span style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
                {s.label}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: '-0.03em'
                }}
              >
                {s.value}
              </span>
              <span className="hd-mono hd-small" style={{ fontSize: 11 }}>
                {s.sub}
              </span>
            </div>
          ))}
        </div>

        <Card title="Assinatura">
          <dl
            className="hd-dl"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'
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
              <dd className="hd-mono" style={{ fontSize: 12 }}>
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
                    style={{ display: 'block', fontSize: 11 }}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgb(64 214 150 / 0.08)',
                border: '1px solid rgb(64 214 150 / 0.25)',
                color: 'var(--hd-ok)',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              <Icon name="check" size={16} strokeWidth={2} />
              Busca e plano batem: {PLAN_NAMES[ficha.barPlan]} na busca.
            </div>
          )}
        </Card>

        <Card title="Próximos jogos" gap={8}>
          {games.length ? (
            games.slice(0, 3).map((g) => (
              <div
                key={g.id}
                className="hd-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px minmax(0, 1fr) auto',
                  minHeight: 48
                }}
              >
                <span className="hd-mono hd-small">
                  {formatDateTime(g.startsAt)}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {g.title}
                </span>
                <span
                  className="hd-mono"
                  style={{ fontSize: 12, color: 'var(--hd-soft)' }}
                >
                  {countLabel(g.reservations, 'código', 'códigos')}
                </span>
              </div>
            ))
          ) : (
            <p className="hd-small" style={{ margin: 0 }}>
              Nenhum jogo por vir.
            </p>
          )}
        </Card>
      </div>

      <div
        style={{
          flex: '2 1 320px',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <Card title="Dono" gap={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              className="hd-avatar"
              style={{
                width: 40,
                height: 40,
                background: 'var(--hd-roxo-tint)'
              }}
            >
              {ficha.owner.name.slice(0, 1).toUpperCase() || '?'}
            </span>
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                minWidth: 0
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {ficha.owner.name}
              </span>
              <span
                className="hd-mono hd-small"
                style={{ overflowWrap: 'anywhere' }}
              >
                {ficha.owner.email} ·{' '}
                {ficha.owner.emailVerified
                  ? 'e-mail verificado'
                  : 'e-mail não verificado'}
              </span>
            </span>
          </div>
          <dl className="hd-dl">
            <div>
              <dt>Telefone do bar</dt>
              <dd>{ficha.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>Conta</dt>
              <dd>{ficha.owner.banned ? 'sumida' : 'ativa'}</dd>
            </div>
          </dl>
        </Card>
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
            borderTop: i ? '1px solid rgb(255 255 255 / 0.05)' : undefined
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
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {r.main}
              {r.tag ? (
                <span className="hd-pill" style={{ marginLeft: 8 }}>
                  {r.tag}
                </span>
              ) : null}
            </span>
            <span style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
              {r.sub}
            </span>
          </span>
          <span
            className="hd-mono"
            style={{ fontSize: 12, color: 'var(--hd-soft)' }}
          >
            {r.right}
          </span>
        </div>
      ))}
    </section>
  )
}
