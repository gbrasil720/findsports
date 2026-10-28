import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { refusalMessage } from '@/components/houdini/errors'
import {
  formatDate,
  formatDateTime,
  formatTime,
  nowLine,
  when
} from '@/components/houdini/format'
import { GrimorioRow } from '@/components/houdini/grimorio'
import { Icon, type IconName } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { appHref } from '@/lib/houdini-host'
import { countLabel } from '@/lib/plural'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/')({
  head: () => ({ meta: [{ title: 'Houdini' }] }),
  component: InicioPage
})

const TZ = 'America/Sao_Paulo'

/** "Boa <em>noite</em>." pela hora de Brasília. */
function greeting(now = new Date()) {
  const hour = Number(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: TZ
    })
  )
  if (hour < 5 || hour >= 18) return ['Boa', 'noite'] as const
  if (hour < 12) return ['Bom', 'dia'] as const
  return ['Boa', 'tarde'] as const
}

/**
 * A hora do cabeçalho anda sozinha; no servidor e na hidratação sai a mesma
 * (a do render), e o minuto seguinte só chega no cliente.
 */
function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

type Coelho = inferRouterOutputs<AppRouter>['houdini']['coelhos'][number]
type Pede = inferRouterOutputs<AppRouter>['houdini']['pedeAMao']
type Tone = 'live' | 'acid' | 'ink' | 'stone' | 'draft' | undefined

const NEW_ACCOUNT: Record<string, string> = {
  fan: 'torcedor novo',
  pub: 'dono novo',
  admin: 'admin novo'
}

/** Os mesmos títulos dos cartões do Bastidores. */
const JOB_TITLES: Record<string, string> = {
  bar_plans: 'Reconciliação diária',
  analytics_retention: 'Limpeza dos analytics'
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
      tone: c.role === 'fan' ? undefined : 'stone',
      opens: { pessoa: c.id }
    }
  }
  if (c.type === 'bar') {
    return {
      kind: 'bar novo',
      what: `${c.name} · ${c.neighborhood}, ${c.city}`,
      tone: 'ink',
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
        tone: 'live',
        opens
      }
    case 'active':
      return {
        kind: 'assinatura',
        what: `${c.barName} assina o ${plan}`,
        tone: 'acid',
        opens
      }
    case 'trialing':
      return c.stripe
        ? {
            kind: 'checkout',
            what: `${c.barName} contratou o ${plan}${until ? `, cobra em ${until}` : ''}`,
            tone: 'acid',
            opens
          }
        : {
            kind: 'teste mexido',
            what: `${c.barName} testa o ${plan}${until ? ` até ${until}` : ''}`,
            tone: 'draft',
            opens
          }
    default:
      return {
        kind: 'encerrada',
        what: `${c.barName} · assinatura encerrada`,
        tone: 'draft',
        opens
      }
  }
}

function InicioPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const quiet = { meta: { errorToast: false } } as const
  const now = useClock()
  const overview = useQuery({
    ...trpc.houdini.overview.queryOptions(),
    staleTime: 30_000,
    ...quiet
  })
  const pede = useQuery({ ...trpc.houdini.pedeAMao.queryOptions(), ...quiet })
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
  const [hello, part] = greeting(now)
  const endingToday = pede.data?.endingToday.length ?? 0
  const siteHref =
    typeof window === 'undefined'
      ? '/'
      : appHref('/', new URL(window.location.href))

  const tiles: Array<{
    to:
      | '/houdini/pessoas'
      | '/houdini/bares'
      | '/houdini/ampulheta'
      | '/houdini/fantasmas'
    label: string
    icon: IconName
    value: number | undefined
    sub: ReactNode
    tone?: 'hero' | 'live'
  }> = [
    {
      to: '/houdini/pessoas',
      label: 'Pessoas',
      icon: 'users',
      value: o?.people.total,
      sub: o ? (
        <>
          <b>+{o.people.novas}</b> desde ontem
        </>
      ) : null
    },
    {
      to: '/houdini/bares',
      label: 'Bares no ar',
      icon: 'store',
      value: o?.bars.noAr,
      sub: o ? (
        <>
          <b>{o.bars.emTeste}</b> em teste · <b>{o.bars.pagando}</b> pagando
        </>
      ) : null
    },
    {
      to: '/houdini/ampulheta',
      label: 'Testes acabando',
      icon: 'hourglass',
      value: o?.testesAcabando,
      sub: (
        <>
          {endingToday ? <b>{endingToday} hoje · </b> : null}nos próximos 7 dias
        </>
      ),
      tone: 'hero'
    },
    {
      to: '/houdini/fantasmas',
      label: 'Fantasmas',
      icon: 'ghost',
      value: o?.fantasmas,
      sub: 'bares sem registrar código',
      tone: 'live'
    }
  ]

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline={<span suppressHydrationWarning>{nowLine(now)}</span>}
          title={
            <span suppressHydrationWarning>
              {hello} <em>{part}</em>.
            </span>
          }
          summary={
            o ? (
              <>
                Desde ontem:{' '}
                <b>
                  {countLabel(o.people.novas, 'conta nova', 'contas novas')}
                </b>{' '}
                e <b>{countLabel(o.bars.novos, 'bar', 'bares')}</b>{' '}
                {o.people.novas + o.bars.novos === 1 ? 'entrou' : 'entraram'}.
              </>
            ) : (
              'Tudo que entrou e saiu da cartola desde ontem.'
            )
          }
          actions={
            <>
              <Link to="/houdini/grimorio" className="hd-btn">
                <Icon name="book" size={18} />
                Abrir o Grimório
              </Link>
              <a className="hd-btn" href={siteHref}>
                <Icon name="external" size={18} />
                Ver onside.sh
              </a>
            </>
          }
        />

        <section className="hd-grid is-kpis" aria-label="Números de hoje">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              to={tile.to}
              className={`hd-card hd-kpi${tile.tone ? ` is-${tile.tone}` : ''}`}
            >
              <span className="lbl">
                <Icon name={tile.icon} size={16} />
                {tile.label}
              </span>
              <span className="num">{tile.value ?? '—'}</span>
              <span className="sub">{tile.sub}</span>
            </Link>
          ))}
        </section>

        <PedeAMao data={pede.data} loading={pede.isLoading} />

        <div className="hd-cols">
          <section
            className="hd-card grow"
            aria-labelledby="coelhos-h"
            style={{ gap: 6 }}
          >
            <div className="hd-card-hd">
              <h2 id="coelhos-h" className="hd-h2">
                Coelhos
              </h2>
              <span
                className="meta"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <span className="hd-dot" />
                ao vivo · atualiza a cada minuto
              </span>
            </div>
            {coelhos.data?.length ? (
              <div>
                {coelhos.data.map((c) => (
                  <CoelhoRow key={`${c.type}:${c.id}`} coelho={c} />
                ))}
              </div>
            ) : (
              <p className="hd-small" style={{ margin: 0 }}>
                {coelhos.isLoading
                  ? 'Contando coelhos…'
                  : 'Nenhum coelho ainda.'}
              </p>
            )}
          </section>

          <section
            className="hd-card side"
            aria-labelledby="grim-h"
            style={{ gap: 6 }}
          >
            <div className="hd-card-hd">
              <h2 id="grim-h" className="hd-h2">
                Grimório
              </h2>
              <Link to="/houdini/grimorio" className="meta">
                ver tudo
              </Link>
            </div>
            {grimorio.data?.entries.length ? (
              <div>
                {grimorio.data.entries.map((entry) => (
                  <GrimorioRow key={entry.id} entry={entry} compact />
                ))}
              </div>
            ) : (
              <p className="hd-small" style={{ margin: 0 }}>
                {grimorio.isLoading ? 'Lendo…' : 'Nenhum truque escrito ainda.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </HoudiniShell>
  )
}

/**
 * "Pede a sua mão": o que só sai com alguém agindo. Cada linha some quando
 * o problema deixa de existir (a consulta é refeita depois de cada truque).
 */
function PedeAMao({ data, loading }: { data?: Pede; loading: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all(
      [trpc.houdini, trpc.adminBars, trpc.grimorio].map((r) =>
        queryClient.invalidateQueries({ queryKey: r.pathKey() })
      )
    )
  const sync = useMutation(
    trpc.adminBars.syncSearchPlan.mutationOptions({
      onSuccess: async (result, input) => {
        const name = data?.drift.find((b) => b.id === input.barId)?.name
        toast.success(
          `Busca${name ? ` de ${name}` : ''} em ${PLAN_NAMES[result.after]} agora. Anotado no Grimório.`
        )
        await refresh()
      },
      onError: (error) =>
        toast.error(refusalMessage(error, 'Não foi possível arrumar a busca.'))
    })
  )
  const extend = useMutation(
    trpc.adminBars.extendTrial.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Teste até ${result.currentPeriodEnd ? formatDateTime(result.currentPeriodEnd) : '—'}.`
        )
        await refresh()
      },
      onError: (error) =>
        toast.error(refusalMessage(error, 'Não foi possível estender o teste.'))
    })
  )
  const busy = (barId: string) =>
    (sync.isPending && sync.variables?.barId === barId) ||
    (extend.isPending && extend.variables?.barId === barId)

  const rows: Array<{
    key: string
    tone?: 'acid' | 'sand'
    what: ReactNode
    action: ReactNode
  }> = data
    ? [
        ...data.pastDue.map((b) => ({
          key: `due:${b.id}`,
          what: (
            <>
              <b>{b.name}</b> não pagou a fatura do {PLAN_NAMES[b.plan]}
            </>
          ),
          action: (
            <Link
              to="/houdini/bares/$barId"
              params={{ barId: b.id }}
              className="hd-btn is-sm"
            >
              Abrir o bar
            </Link>
          )
        })),
        ...data.jobs.map((j) => ({
          key: `job:${j.job}`,
          what: (
            <>
              <b>{JOB_TITLES[j.job] ?? j.job}</b> falhou {when(j.startedAt)}
              {j.error ? ` · ${j.error}` : ''}
            </>
          ),
          action: (
            <Link to="/houdini/bastidores" className="hd-btn is-sm">
              Ver bastidores
            </Link>
          )
        })),
        ...data.drift.map((b) => ({
          key: `drift:${b.id}`,
          tone: 'sand' as const,
          what: (
            <>
              <b>Busca desatualizada</b> em{' '}
              <Link to="/houdini/bares/$barId" params={{ barId: b.id }}>
                {b.name}
              </Link>{' '}
              · plano {PLAN_NAMES[b.expectedSearchPlan]}, busca em{' '}
              {PLAN_NAMES[b.barPlan]}
            </>
          ),
          action: (
            <button
              type="button"
              className="hd-btn is-sm"
              disabled={sync.isPending || extend.isPending}
              onClick={() => sync.mutate({ barId: b.id })}
            >
              {busy(b.id) ? 'Arrumando…' : 'Arrumar agora'}
            </button>
          )
        })),
        ...data.endingToday.map((b) => {
          const end = b.currentPeriodEnd ? new Date(b.currentPeriodEnd) : null
          return {
            key: `trial:${b.id}`,
            tone: 'acid' as const,
            what: (
              <>
                Teste do{' '}
                <Link to="/houdini/bares/$barId" params={{ barId: b.id }}>
                  <b>{b.name}</b>
                </Link>{' '}
                {end && end > new Date()
                  ? `acaba hoje às ${formatTime(end)}`
                  : `venceu${end ? ` às ${formatTime(end)}` : ''}`}{' '}
                ·{' '}
                {countLabel(b.upcomingGames, 'jogo marcado', 'jogos marcados')}
              </>
            ),
            action: (
              <button
                type="button"
                className="hd-btn is-sm"
                disabled={sync.isPending || extend.isPending}
                onClick={() => extend.mutate({ barId: b.id, days: 14 })}
              >
                {busy(b.id) ? 'Estendendo…' : '+14 dias'}
              </button>
            )
          }
        })
      ]
    : []

  return (
    <section className="hd-card" aria-labelledby="pede-h" style={{ gap: 6 }}>
      <div className="hd-card-hd">
        <h2 id="pede-h" className="hd-h2">
          Pede a sua mão
        </h2>
        {rows.length ? (
          <span className="meta">
            {countLabel(rows.length, 'coisa', 'coisas')} · some daqui quando
            resolve
          </span>
        ) : null}
      </div>
      {rows.length ? (
        <div>
          {rows.map((row) => (
            <div key={row.key} className="hd-row" style={{ flexWrap: 'wrap' }}>
              <span className="hd-dot" data-tone={row.tone} />
              <span className="what">{row.what}</span>
              {row.action}
            </div>
          ))}
        </div>
      ) : (
        <p className="hd-small" style={{ margin: 0 }}>
          {loading ? 'Olhando a cartola…' : 'Nada pede a sua mão agora.'}
        </p>
      )}
    </section>
  )
}

function CoelhoRow({ coelho: c }: { coelho: Coelho }) {
  const d = describeCoelho(c)
  const body = (
    <>
      <time
        className="when"
        dateTime={new Date(c.at).toISOString()}
        suppressHydrationWarning
      >
        {when(c.at)}
      </time>
      <span className="kind">
        <span className="hd-pill" data-tone={d.tone}>
          {d.kind}
        </span>
      </span>
      <span className="what">{d.what}</span>
      <span className="end">
        <Icon name="next" size={16} />
      </span>
    </>
  )
  return 'pessoa' in d.opens ? (
    <Link to="/houdini/pessoas" search={d.opens} className="hd-row">
      {body}
    </Link>
  ) : (
    <Link to="/houdini/bares" search={d.opens} className="hd-row">
      {body}
    </Link>
  )
}
