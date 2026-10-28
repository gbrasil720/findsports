import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import type { CSSProperties } from 'react'
import { toast } from 'sonner'
import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/bastidores')({
  head: () => ({ meta: [{ title: 'Bastidores — Houdini' }] }),
  component: BastidoresPage
})

type Status = inferRouterOutputs<AppRouter>['bastidores']['status']
type Job = Status['jobs'][number]
type State = 'ok' | 'warn' | 'bad' | 'link'

const STATES: Record<State, { color: string; tint: string; label: string }> = {
  ok: { color: 'var(--hd-ok)', tint: 'var(--hd-ok-tint)', label: 'em ordem' },
  warn: {
    color: 'var(--hd-warn)',
    tint: 'rgb(242 196 109 / 0.14)',
    label: 'atenção'
  },
  bad: { color: 'var(--hd-bad)', tint: 'var(--hd-bad-tint)', label: 'falhou' },
  // Serviço de fora: o Houdini só aponta para o painel dele.
  link: {
    color: 'var(--hd-faint)',
    tint: 'rgb(255 255 255 / 0.06)',
    label: 'no painel'
  }
}

const BORDERS: Record<State, string> = {
  ok: 'var(--hd-line)',
  link: 'var(--hd-line)',
  warn: 'rgb(242 196 109 / 0.35)',
  bad: 'rgb(255 92 122 / 0.4)'
}

function ago(date: Date | string, now = Date.now()) {
  const minutes = Math.round((now - new Date(date).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} dias`
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

type Fact = { k: string; v: string }
type Check = {
  key: string
  title: string
  where: string
  state: State
  facts: Fact[]
  error?: string | null
  job?: Job['job']
  href?: { label: string; url: string }
}

function lastRunFacts(job: Job | undefined): Fact[] {
  const run = job?.lastRun
  return [
    {
      k: 'Última execução',
      v: run
        ? `${ago(run.startedAt)} · ${run.trigger === 'houdini' ? 'Houdini' : 'cron'}`
        : 'nenhuma registrada'
    }
  ]
}

function counts(job: Job | undefined) {
  const result = job?.lastRun?.ok ? job.lastRun.result : null
  return (result ?? {}) as Record<string, number | undefined>
}

function buildChecks(status: Status): Check[] {
  const plans = status.jobs.find((j) => j.job === 'bar_plans')
  const retention = status.jobs.find((j) => j.job === 'analytics_retention')
  const notices = status.jobs.find((j) => j.job === 'bar_notices')
  const aiRuns = status.jobs.find((j) => j.job === 'ai_stale_runs')
  const next = plans ? formatDateTime(plans.nextRunAt) : '—'
  const { migrations, database, tiles, deploy } = status
  const p = counts(plans)
  const r = counts(retention)
  const n = counts(notices)
  const a = counts(aiRuns)

  return [
    {
      key: 'bar_plans',
      title: 'Reconciliação diária dos planos',
      where: 'cron do Worker · reconcileBarPlans',
      state: plans?.state ?? 'warn',
      job: 'bar_plans',
      error: plans?.lastRun?.ok === false ? plans.lastRun.error : null,
      facts: [
        ...lastRunFacts(plans),
        { k: 'Próxima', v: next },
        {
          k: 'Planos corrigidos',
          v: p.updated === undefined ? '—' : plural(p.updated, 'bar', 'bares')
        },
        {
          k: 'Tirados do ar',
          v: p.offAir === undefined ? '—' : plural(p.offAir, 'bar', 'bares')
        }
      ]
    },
    {
      key: 'stripe',
      title: 'Webhook do Stripe',
      where: '/api/auth/stripe/webhook',
      state: 'link',
      facts: [{ k: 'Eventos e falhas', v: 'no painel do Stripe' }],
      href: {
        label: 'Abrir no Stripe',
        url: 'https://dashboard.stripe.com/webhooks'
      }
    },
    {
      key: 'migrations',
      title: 'Migrations',
      where: 'drizzle.__drizzle_migrations',
      state: migrations.state,
      error: 'error' in migrations ? migrations.error : null,
      facts:
        'applied' in migrations
          ? [
              {
                k: 'Banco em',
                v: `${migrations.appliedTag ?? '—'} (${migrations.applied})`
              },
              {
                k: 'Último arquivo no código',
                v: `${migrations.lastFile ?? '—'} (${migrations.files})`
              }
            ]
          : []
    },
    {
      key: 'deploy',
      title: 'Deploy',
      where: 'Worker onside-web',
      state: deploy ? 'ok' : 'link',
      facts: deploy
        ? [
            { k: 'Versão no ar', v: deploy.id.slice(0, 8) },
            { k: 'Commit', v: deploy.tag || '—' },
            { k: 'Publicado', v: formatDateTime(deploy.timestamp) }
          ]
        : [{ k: 'Versão no ar', v: 'local' }],
      href: {
        label: 'Ver no Cloudflare',
        url: 'https://dash.cloudflare.com/?to=/:account/workers/services/view/onside-web/production/deployments'
      }
    },
    {
      key: 'email',
      title: 'E-mail',
      where: 'Resend',
      state: 'link',
      facts: [{ k: 'Enviados e falhas', v: 'no painel do Resend' }],
      href: { label: 'Abrir no Resend', url: 'https://resend.com/emails' }
    },
    {
      key: 'errors',
      title: 'Erros no app',
      where: 'PostHog · error tracking',
      state: 'link',
      facts: [{ k: 'Erros e frequência', v: 'no painel do PostHog' }],
      href: {
        label: 'Abrir no PostHog',
        url: 'https://eu.posthog.com/error_tracking'
      }
    },
    {
      key: 'database',
      title: 'Banco',
      where: 'Neon via Hyperdrive',
      state: database.state,
      error: 'error' in database ? database.error : null,
      facts:
        'latencyMs' in database
          ? [
              { k: 'Latência', v: `${database.latencyMs} ms` },
              { k: 'Medida', v: 'SELECT 1, no servidor' }
            ]
          : []
    },
    {
      key: 'analytics_retention',
      title: 'Limpeza dos analytics',
      where: 'mesmo cron · analytics_retention_run',
      state: retention?.state ?? 'warn',
      job: 'analytics_retention',
      error: retention?.lastRun?.ok === false ? retention.lastRun.error : null,
      facts: [
        ...lastRunFacts(retention),
        { k: 'Esperado', v: 'todo dia 01:00' },
        { k: 'Dias consolidados', v: String(r.diasFinalizados ?? '—') },
        { k: 'Eventos apagados', v: String(r.eventosApagados ?? '—') }
      ]
    },
    {
      key: 'ai_stale_runs',
      title: 'Execuções presas da IA',
      where: 'mesmo cron · closeStaleRuns',
      state: aiRuns?.state ?? 'warn',
      job: 'ai_stale_runs',
      error: aiRuns?.lastRun?.ok === false ? aiRuns.lastRun.error : null,
      facts: [
        ...lastRunFacts(aiRuns),
        { k: 'Esperado', v: 'todo dia 01:00' },
        { k: 'Encerradas', v: String(a.closed ?? '—') }
      ]
    },
    {
      key: 'bar_notices',
      title: 'Avisos da semana dos bares',
      where: 'mesmo cron · sendWeeklyBarNotices',
      state: notices?.state ?? 'warn',
      job: 'bar_notices',
      error: notices?.lastRun?.ok === false ? notices.lastRun.error : null,
      facts: [
        ...lastRunFacts(notices),
        { k: 'Esperado', v: 'todo dia 01:00, envia às segundas' },
        {
          k: 'Resumos',
          v: String(n.weeklySummaries ?? '—')
        },
        { k: 'Grade vazia', v: String(n.emptySchedules ?? '—') }
      ]
    },
    {
      key: 'tiles',
      title: 'Tiles do mapa',
      where: 'tiles.onside.sh',
      state: tiles.state,
      error:
        'error' in tiles
          ? tiles.error
          : tiles.state === 'bad'
            ? `HTTP ${tiles.status}`
            : null,
      facts:
        'latencyMs' in tiles
          ? [
              { k: 'Resposta', v: `${tiles.latencyMs} ms` },
              { k: 'Archive', v: tiles.tileset }
            ]
          : []
    }
  ]
}

function summarize(checks: Check[]) {
  const bad = checks.filter((c) => c.state === 'bad').length
  const warn = checks.filter((c) => c.state === 'warn').length
  const worst: State = bad ? 'bad' : warn ? 'warn' : 'ok'
  const text =
    worst === 'ok'
      ? 'Tudo em ordem'
      : [
          bad ? `${bad} ${bad === 1 ? 'falhou' : 'falharam'}` : '',
          warn ? `${warn} ${warn === 1 ? 'pede' : 'pedem'} atenção` : ''
        ]
          .filter(Boolean)
          .join(' · ')
  return { worst, text }
}

function Dot({ state, size = 10 }: { state: State; size?: number }) {
  const { color } = STATES[state]
  return (
    <span
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: state === 'link' ? 'none' : `0 0 10px ${color}`
      }}
    />
  )
}

const badge = (state: State): CSSProperties => ({
  background: STATES[state].tint,
  color: STATES[state].color,
  fontWeight: 700
})

function BastidoresPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const status = useQuery({
    ...trpc.bastidores.status.queryOptions(),
    meta: { errorToast: false }
  })

  async function reload() {
    await queryClient.invalidateQueries({
      queryKey: trpc.bastidores.status.queryKey()
    })
  }

  const run = useMutation(
    trpc.bastidores.run.mutationOptions({
      onSuccess: async () => {
        toast.success('Rodou. O resultado está no cartão.')
        await reload()
      },
      // A falha também fica registrada: o cartão passa a mostrar o erro.
      onError: async (error) => {
        toast.error(getUserFacingMessage(error, 'A rotina falhou.'))
        await reload()
      }
    })
  )

  const checks = status.data ? buildChecks(status.data) : []
  const summary = summarize(checks)

  return (
    <HoudiniShell title="Bastidores" env={env} user={admin}>
      <div className="hd-page" style={{ maxWidth: 1240 }}>
        <div className="hd-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="hd-h1">Bastidores</h1>
            <p className="hd-lead">
              O que roda sem ninguém ver. Se algo aqui falha, alguém lá fora
              sente.
            </p>
          </div>
          {status.data ? (
            <span
              className="hd-pill"
              role="status"
              style={{
                ...badge(summary.worst),
                gap: 8,
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 10,
                fontSize: 13
              }}
            >
              <Dot state={summary.worst} size={8} />
              {summary.text}
            </span>
          ) : null}
        </div>

        {status.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                status.error,
                'Não foi possível ler os bastidores.'
              )}
            </p>
            <button
              type="button"
              className="hd-btn"
              style={{ alignSelf: 'flex-start', marginTop: 12 }}
              onClick={() => void status.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        ) : status.isLoading ? (
          <div className="hd-skeleton" style={{ height: 320 }} />
        ) : (
          <div
            className="hd-grid"
            style={{ '--hd-min': 'min(340px, 100%)' } as CSSProperties}
          >
            {checks.map((check) => (
              <article
                key={check.key}
                className="hd-card"
                aria-labelledby={`bs-${check.key}`}
                style={{
                  gap: 12,
                  padding: 18,
                  borderColor: BORDERS[check.state]
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
                >
                  <span style={{ marginTop: 4, display: 'flex' }}>
                    <Dot state={check.state} />
                  </span>
                  <div
                    style={{
                      flexGrow: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}
                  >
                    <h2
                      id={`bs-${check.key}`}
                      className="hd-h2"
                      style={{ fontSize: 14, fontWeight: 700 }}
                    >
                      {check.title}
                    </h2>
                    <span
                      className="hd-mono"
                      style={{
                        fontSize: 11,
                        color: 'var(--hd-faint)',
                        overflowWrap: 'anywhere'
                      }}
                    >
                      {check.where}
                    </span>
                  </div>
                  <span className="hd-pill" style={badge(check.state)}>
                    {STATES[check.state].label}
                  </span>
                </div>
                {check.facts.length ? (
                  <dl className="hd-dl" style={{ gap: '8px 14px' }}>
                    {check.facts.map((fact) => (
                      <div key={fact.k}>
                        <dt style={{ fontSize: 11 }}>{fact.k}</dt>
                        <dd>{fact.v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {check.error ? (
                  <p
                    className="hd-mono"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: 'var(--hd-bad)',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {check.error}
                  </p>
                ) : null}
                {check.job ? (
                  <button
                    type="button"
                    className="hd-btn hd-btn-soft"
                    style={{ alignSelf: 'flex-start' }}
                    disabled={run.isPending}
                    onClick={() => check.job && run.mutate({ job: check.job })}
                  >
                    {run.isPending && run.variables?.job === check.job
                      ? 'Rodando…'
                      : 'Rodar agora'}
                  </button>
                ) : check.href ? (
                  <a
                    href={check.href.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hd-btn hd-btn-soft"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {check.href.label}
                    <Icon name="external" size={14} strokeWidth={1.8} />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <p className="hd-small" style={{ margin: 0 }}>
          Rodar agora faz o mesmo que o cron faria e fica no Grimório. Rollback
          de deploy continua pelo{' '}
          <code className="hd-mono">wrangler rollback</code>: o Houdini só
          mostra.
        </p>
      </div>
    </HoudiniShell>
  )
}
