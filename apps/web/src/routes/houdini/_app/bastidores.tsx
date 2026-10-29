import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import type { CSSProperties } from 'react'
import { toast } from 'sonner'
import { refusalMessage } from '@/components/houdini/errors'
import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/bastidores')({
  head: () => ({ meta: [{ title: 'Bastidores — Houdini' }] }),
  component: BastidoresPage
})

type Status = inferRouterOutputs<AppRouter>['bastidores']['status']
type Job = Status['jobs'][number]
type State = 'ok' | 'warn' | 'bad' | 'link'

/** Selo e ponto de cada situação, nas cores do design. */
const STATES: Record<
  State,
  { tone?: 'live' | 'sand' | 'draft'; dot: string; label: string }
> = {
  ok: { dot: 'acid', label: 'em ordem' },
  warn: { tone: 'sand', dot: 'sand', label: 'atenção' },
  bad: { tone: 'live', dot: 'live', label: 'falhou' },
  // Serviço de fora: o Houdini só aponta para o painel dele.
  link: { tone: 'draft', dot: 'muted', label: 'no painel' }
}

const GLOSSARY = [
  [
    'Reconciliação diária',
    'Toda madrugada confere o plano de cada bar com a assinatura: corrige a busca e tira do ar quem ficou sem teste e sem assinatura.'
  ],
  [
    'Cron',
    'Tarefa que roda sozinha num horário fixo, como a reconciliação à 01:00.'
  ],
  [
    'Migrations',
    'As mudanças na estrutura do banco. "Atenção" quer dizer que o código já espera uma mudança que o banco ainda não recebeu.'
  ],
  [
    'Deploy',
    'A versão do site que está no ar agora e quando ela foi publicada.'
  ],
  [
    'Webhook do Stripe',
    'O aviso que o Stripe manda quando alguém paga, cancela ou atrasa. Se ele falhar, o plano do bar não atualiza.'
  ],
  ['Latência', 'Quanto o banco demora para responder. Até uns 50 ms é normal.'],
  [
    'Tiles do mapa',
    'Os pedaços de mapa que o app baixa. Resposta lenta aqui deixa o mapa em branco.'
  ],
  [
    'No painel',
    'Serviço que o Houdini não mede sozinho: o botão abre o painel do fornecedor.'
  ]
] as const

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
  const next = plans ? formatDateTime(plans.nextRunAt) : '—'
  const { migrations, database, tiles, deploy } = status
  const p = counts(plans)
  const r = counts(retention)

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
      where: 'MillionSend',
      state: 'link',
      facts: [{ k: 'Enviados e falhas', v: 'no painel da MillionSend' }],
      href: {
        label: 'Abrir na MillionSend',
        url: 'https://app.millionsend.com/emails'
      }
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

/** Quantos falharam, pedem atenção e estão em ordem, para os selos do topo. */
function summarize(checks: Check[]) {
  const n = (state: State) => checks.filter((c) => c.state === state).length
  const bad = n('bad')
  const warn = n('warn')
  const ok = n('ok')
  return [
    bad
      ? {
          tone: 'live' as const,
          text: `${bad} ${bad === 1 ? 'falhou' : 'falharam'}`
        }
      : null,
    warn
      ? {
          tone: 'sand' as const,
          text: `${warn} ${warn === 1 ? 'pede' : 'pedem'} atenção`
        }
      : null,
    ok ? { tone: undefined, text: `${ok} em ordem` } : null
  ].filter((badge) => badge !== null)
}

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
        toast.error(refusalMessage(error, 'A rotina falhou.'))
        await reload()
      }
    })
  )

  const checks = status.data ? buildChecks(status.data) : []
  const summary = summarize(checks)

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Máquina"
          title="Bastidores"
          summary="O que roda sem ninguém ver. Se algo aqui falha, alguém lá fora sente."
          actions={
            status.data ? (
              <span
                role="status"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
              >
                {summary.map((badge) => (
                  <span
                    key={badge.text}
                    className="hd-pill is-lg"
                    data-tone={badge.tone}
                  >
                    {badge.text}
                  </span>
                ))}
              </span>
            ) : null
          }
        >
          <a className="hd-help" href="#legenda">
            <Icon name="help" size={16} />
            Como ler esta página
          </a>
        </PageHead>

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
          <section
            className="hd-grid"
            aria-label="Serviços"
            style={
              {
                '--hd-min': 'min(320px, 100%)',
                alignItems: 'start'
              } as CSSProperties
            }
          >
            {checks.map((check) => (
              <article
                key={check.key}
                className={`hd-card${check.state === 'bad' ? ' is-live' : ''}`}
                aria-labelledby={`bs-${check.key}`}
                style={{ gap: 14 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className="hd-dot"
                    data-tone={STATES[check.state].dot}
                  />
                  <h2
                    id={`bs-${check.key}`}
                    className="hd-h2"
                    style={{ flex: '1 1 auto', minWidth: 0 }}
                  >
                    {check.title}
                  </h2>
                  <span
                    className="hd-pill"
                    data-tone={STATES[check.state].tone}
                  >
                    {STATES[check.state].label}
                  </span>
                </div>
                <span
                  className="hd-mono hd-small"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {check.where}
                </span>
                {check.facts.length ? (
                  <dl className="hd-dl">
                    {check.facts.map((fact) => (
                      <div key={fact.k}>
                        <dt>{fact.k}</dt>
                        <dd>{fact.v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {check.error ? (
                  <pre
                    className="hd-mono"
                    style={{
                      margin: 0,
                      padding: '10px 12px',
                      borderRadius: 5,
                      background: 'var(--hd-live-tint)',
                      color: 'var(--hd-live-text)',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {check.error}
                  </pre>
                ) : null}
                {check.job ? (
                  <button
                    type="button"
                    className={
                      check.state === 'bad'
                        ? 'hd-btn hd-btn-primary is-sm'
                        : 'hd-btn is-sm'
                    }
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
                    className="hd-btn is-sm"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {check.href.label}
                    <Icon name="external" size={14} />
                  </a>
                ) : null}
              </article>
            ))}
          </section>
        )}

        <section
          id="legenda"
          className="hd-card"
          aria-labelledby="legenda-h"
          style={{ gap: 14 }}
        >
          <div className="hd-card-hd">
            <h2 id="legenda-h" className="hd-h2">
              Como ler esta página
            </h2>
            <span className="meta">o que cada peça faz</span>
          </div>
          <dl className="hd-gloss">
            {GLOSSARY.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="hd-note">
          “Rodar agora” faz o mesmo que o cron faria e fica no Grimório.
          Rollback de deploy continua pelo{' '}
          <code className="hd-mono">wrangler rollback</code>: o Houdini só
          mostra.
        </p>
      </div>
    </HoudiniShell>
  )
}
