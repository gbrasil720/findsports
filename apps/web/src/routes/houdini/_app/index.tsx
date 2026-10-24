import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay
} from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'

import { formatDate } from '@/components/houdini/format'
import { GrimorioRow } from '@/components/houdini/grimorio'
import { Icon, type IconName } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/')({
  head: () => ({ meta: [{ title: 'Houdini' }] }),
  component: InicioPage
})

function greeting(now = new Date()) {
  const hour = Number(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: TZ
    })
  )
  if (hour < 5 || hour >= 18) return 'Boa noite.'
  if (hour < 12) return 'Bom dia.'
  return 'Boa tarde.'
}

const TZ = BRASILIA_TIME_ZONE
const day = (date: Date) => date.toLocaleDateString('pt-BR', { timeZone: TZ })

/** "hoje 14:02", "ontem 22:05" ou "12/10 09:30", no horário de Brasília. */
function when(value: Date | string) {
  const date = new Date(value)
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
  const now = new Date()
  if (brasiliaDay(date) === brasiliaDay(now)) return `hoje ${time}`
  if (brasiliaDay(date) === brasiliaDay(now, -1)) return `ontem ${time}`
  return `${day(date).slice(0, 5)} ${time}`
}

type Coelho = inferRouterOutputs<AppRouter>['houdini']['coelhos'][number]
type Tone = 'roxo' | 'ok' | 'bad' | undefined

const NEW_ACCOUNT: Record<string, string> = {
  fan: 'torcedor novo',
  pub: 'dono novo',
  admin: 'admin novo'
}

/**
 * Como cada coelho aparece. A assinatura diz em que pé está, não o que mudou:
 * o `updated_at` dela anda a cada evento do Stripe (ver `houdini.coelhos`).
 */
function describeCoelho(c: Coelho): {
  kind: string
  what: string
  tone: Tone
  /** A ficha que a linha abre. */
  opens: { pessoa: string } | { bar: string }
} {
  if (c.type === 'person') {
    const city = c.cityName
      ? `${c.cityName}${c.cityUf ? `/${c.cityUf}` : ''}`
      : 'sem cidade'
    return {
      kind: NEW_ACCOUNT[c.role] ?? 'conta nova',
      what: c.role === 'fan' ? `${city} · raio de ${c.radiusKm} km` : c.name,
      tone: c.role === 'fan' ? undefined : 'roxo',
      opens: { pessoa: c.id }
    }
  }
  if (c.type === 'bar') {
    return {
      kind: 'bar novo',
      what: `${c.name} · ${c.neighborhood}, ${c.city}`,
      tone: 'roxo',
      opens: { bar: c.id }
    }
  }
  const opens = { bar: c.barId }
  const plan = PLAN_NAMES[c.plan]
  const until = c.currentPeriodEnd ? formatDate(c.currentPeriodEnd) : null
  switch (c.status) {
    case 'past_due':
      return {
        kind: 'past_due',
        what: `${c.barName} não pagou a fatura`,
        tone: 'bad',
        opens
      }
    case 'active':
      return {
        kind: 'assinatura',
        what: `${c.barName} assina o ${plan}`,
        tone: 'ok',
        opens
      }
    case 'trialing':
      return c.stripe
        ? {
            kind: 'checkout',
            what: `${c.barName} contratou o ${plan}${until ? `, cobra em ${until}` : ''}`,
            tone: 'ok',
            opens
          }
        : {
            kind: 'teste mexido',
            what: `${c.barName} testa o ${plan}${until ? ` até ${until}` : ''}`,
            tone: undefined,
            opens
          }
    default:
      return {
        kind: 'encerrada',
        what: `${c.barName} · assinatura encerrada`,
        tone: 'bad',
        opens
      }
  }
}

function InicioPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const quiet = { meta: { errorToast: false } } as const
  const overview = useQuery({
    ...trpc.houdini.overview.queryOptions(),
    ...quiet
  })
  const coelhos = useQuery({
    ...trpc.houdini.coelhos.queryOptions({ limit: 12 }),
    refetchInterval: 60_000,
    ...quiet
  })
  const grimorio = useQuery({
    ...trpc.grimorio.list.queryOptions({ limit: 6 }),
    ...quiet
  })
  const o = overview.data

  const tiles: Array<{
    to:
      | '/houdini/pessoas'
      | '/houdini/bares'
      | '/houdini/ampulheta'
      | '/houdini/fantasmas'
    label: string
    icon: IconName
    value: number | undefined
    sub: string
    tone?: string
  }> = [
    {
      to: '/houdini/pessoas',
      label: 'Pessoas',
      icon: 'users',
      value: o?.people.total,
      sub: o ? `+${o.people.novas} desde ontem` : ''
    },
    {
      to: '/houdini/bares',
      label: 'Bares no ar',
      icon: 'store',
      value: o?.bars.noAr,
      sub: o ? `${o.bars.emTeste} em teste · ${o.bars.pagando} pagando` : ''
    },
    {
      to: '/houdini/ampulheta',
      label: 'Testes acabando',
      icon: 'hourglass',
      value: o?.testesAcabando,
      sub: 'nos próximos 7 dias',
      tone: 'var(--hd-roxo)'
    },
    {
      to: '/houdini/fantasmas',
      label: 'Fantasmas',
      icon: 'ghost',
      value: o?.fantasmas,
      sub: 'bares sem registrar código',
      tone: 'var(--hd-bad)'
    }
  ]

  return (
    <HoudiniShell title="Início" env={env} user={admin}>
      <div className="hd-page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="hd-h1" style={{ fontSize: 28 }}>
            {greeting()}
          </h1>
          <p className="hd-lead">
            Tudo que entrou e saiu da cartola desde ontem.
          </p>
        </div>
        <div className="hd-grid" style={{ '--hd-min': '200px' } as never}>
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              to={tile.to}
              className="hd-card"
              style={{ gap: 10, textDecoration: 'none' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--hd-muted)'
                }}
              >
                <span style={{ color: tile.tone ?? 'var(--hd-muted)' }}>
                  <Icon name={tile.icon} size={16} strokeWidth={1.8} />
                </span>
                {tile.label}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 30,
                  letterSpacing: '-0.03em'
                }}
              >
                {tile.value ?? '—'}
              </span>
              <span className="hd-mono hd-small">{tile.sub}</span>
            </Link>
          ))}
        </div>
        <section className="hd-card" aria-labelledby="coelhos-h">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8
            }}
          >
            <h2 id="coelhos-h" className="hd-h2">
              Coelhos
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                color: 'var(--hd-muted)'
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--hd-roxo)',
                  boxShadow: '0 0 10px var(--hd-roxo)'
                }}
              />
              ao vivo
            </span>
          </div>
          {coelhos.data?.length ? (
            coelhos.data.map((c) => (
              <CoelhoRow key={`${c.type}:${c.id}`} coelho={c} />
            ))
          ) : (
            <p className="hd-small" style={{ margin: 0 }}>
              {coelhos.isLoading ? 'Contando coelhos…' : 'Nenhum coelho ainda.'}
            </p>
          )}
        </section>
        <section className="hd-card" aria-labelledby="grim-h">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8
            }}
          >
            <h2 id="grim-h" className="hd-h2">
              Grimório
            </h2>
            <Link
              to="/houdini/grimorio"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--hd-roxo-soft)',
                textDecoration: 'none'
              }}
            >
              ver tudo
            </Link>
          </div>
          {grimorio.data?.entries.length ? (
            grimorio.data.entries.map((entry) => (
              <GrimorioRow key={entry.id} entry={entry} compact />
            ))
          ) : (
            <p className="hd-small" style={{ margin: 0 }}>
              {grimorio.isLoading ? 'Lendo…' : 'Nenhum truque escrito ainda.'}
            </p>
          )}
        </section>
      </div>
    </HoudiniShell>
  )
}

const ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 12px',
  minHeight: 40,
  padding: '6px 0',
  borderTop: '1px solid rgb(255 255 255 / 0.05)',
  fontSize: 13,
  textDecoration: 'none'
} as const

function CoelhoRow({ coelho: c }: { coelho: Coelho }) {
  const d = describeCoelho(c)
  const body = (
    <>
      <time
        className="hd-mono"
        dateTime={new Date(c.at).toISOString()}
        style={{
          width: 84,
          fontSize: 12,
          color: 'var(--hd-faint)'
        }}
      >
        {when(c.at)}
      </time>
      <span style={{ width: 112, display: 'inline-flex' }}>
        <span className="hd-pill" data-tone={d.tone}>
          {d.kind}
        </span>
      </span>
      <span
        style={{
          flex: '1 1 220px',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {d.what}
      </span>
    </>
  )
  return 'pessoa' in d.opens ? (
    <Link to="/houdini/pessoas" search={d.opens} style={ROW_STYLE}>
      {body}
    </Link>
  ) : (
    <Link to="/houdini/bares" search={d.opens} style={ROW_STYLE}>
      {body}
    </Link>
  )
}
