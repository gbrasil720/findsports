import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { toast } from 'sonner'
import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/jogos-da-semana')({
  head: () => ({ meta: [{ title: 'Jogos da semana — Houdini' }] }),
  component: JogosDaSemanaPage
})

type Overview =
  inferRouterOutputs<AppRouter>['houdini']['jogosDaSemana']['overview']

const usd = (n: number) => `US$ ${n.toFixed(3)}`

const RUN_STATUS: Record<string, { label: string; tone?: 'live' | 'sand' }> = {
  ok: { label: 'ok' },
  stopped: { label: 'parou no teto', tone: 'sand' },
  error: { label: 'erro', tone: 'live' },
  timeout: { label: 'demorou', tone: 'live' },
  running: { label: 'rodando', tone: 'sand' }
}

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Sources({
  sources
}: {
  sources: Overview['games'][number]['sources']
}) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {sources.map((s, i) =>
        s.url ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a mesma página pode vir duas vezes
            key={`${s.url}-${i}`}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="hd-mono hd-small"
            title={s.channels.join(', ') || 'sem canal'}
          >
            {host(s.url)}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem
          <span key={`fd-${i}`} className="hd-mono hd-small">
            football-data
          </span>
        )
      )}
    </span>
  )
}

function JogosDaSemanaPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const overview = useQuery({
    ...trpc.houdini.jogosDaSemana.overview.queryOptions(),
    meta: { errorToast: false }
  })
  const reload = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.houdini.jogosDaSemana.overview.queryKey()
    })
  const run = useMutation(
    trpc.bastidores.run.mutationOptions({
      onSuccess: async () => {
        toast.success('Rodou. O catálogo abaixo está atualizado.')
        await reload()
      },
      onError: async (error) => {
        toast.error(getUserFacingMessage(error, 'A rotina falhou.'))
        await reload()
      }
    })
  )

  const data = overview.data
  const withChannel = data?.games.filter((g) => g.channels.length).length ?? 0
  const share = data
    ? Math.min(100, (data.monthUsd / data.config.monthlyBudgetUsd) * 100)
    : 0

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Máquina"
          title="Jogos da semana"
          summary="Os jogos que os bares passam, com onde passa no Brasil. Monta às segundas e procura o canal que faltou às quintas."
          actions={
            <button
              type="button"
              className="hd-btn hd-btn-primary"
              disabled={run.isPending}
              onClick={() => run.mutate({ job: 'weekly_games' })}
            >
              {run.isPending ? 'Rodando… (alguns minutos)' : 'Rodar agora'}
            </button>
          }
        />

        {overview.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                overview.error,
                'Não foi possível ler os jogos da semana.'
              )}
            </p>
            <button
              type="button"
              className="hd-btn"
              style={{ alignSelf: 'flex-start', marginTop: 12 }}
              onClick={() => void overview.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        ) : !data ? (
          <div className="hd-skeleton" style={{ height: 420 }} />
        ) : (
          <>
            <section
              className="hd-card"
              aria-labelledby="js-gasto"
              style={{ gap: 12 }}
            >
              <div className="hd-card-hd">
                <h2 id="js-gasto" className="hd-h2">
                  Gasto do mês
                </h2>
                <span
                  className="hd-pill"
                  data-tone={data.config.enabled ? undefined : 'sand'}
                >
                  {data.config.enabled ? 'cron ligado' : 'cron desligado'}
                </span>
              </div>
              <dl className="hd-dl">
                <div>
                  <dt>Gasto</dt>
                  <dd>
                    {usd(data.monthUsd)} de {usd(data.config.monthlyBudgetUsd)}
                  </dd>
                </div>
                <div>
                  <dt>Execuções</dt>
                  <dd>{data.runs.length}</dd>
                </div>
                <div>
                  <dt>Calendário</dt>
                  <dd>
                    {data.footballData ? 'football-data.org' : 'só busca'}
                  </dd>
                </div>
              </dl>
              <div
                aria-hidden="true"
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--hd-line)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${share}%`,
                    height: '100%',
                    background:
                      share >= 80 ? 'var(--hd-live)' : 'var(--hd-acid)'
                  }}
                />
              </div>
              <p className="hd-small" style={{ margin: 0 }}>
                Teto e cron em <Link to="/houdini/feiticos">Feitiços</Link> (
                <code className="hd-mono">weekly_games.config</code>). O teto
                cobre buscas, páginas e IA; passou dele, a rotina para no meio.
              </p>
              {data.runs.length ? (
                <div className="hd-table-wrap is-flat">
                  <table className="hd-table" style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Passada</th>
                        <th>Situação</th>
                        <th>Custo</th>
                        <th>Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.runs.map((r) => (
                        <tr key={r.runId}>
                          <td className="hd-mono">
                            {formatDateTime(r.createdAt)}
                          </td>
                          <td>
                            {r.variant === 'catalog' ? 'segunda' : 'canal'}
                          </td>
                          <td>
                            <span
                              className="hd-pill"
                              data-tone={RUN_STATUS[r.status]?.tone}
                            >
                              {RUN_STATUS[r.status]?.label ?? r.status}
                            </span>
                          </td>
                          <td>{usd(r.costUsd)}</td>
                          <td>{Math.round(r.latencyMs / 1000)} s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section
              className="hd-card"
              aria-labelledby="js-jogos"
              style={{ gap: 12 }}
            >
              <div className="hd-card-hd">
                <h2 id="js-jogos" className="hd-h2">
                  Semana de {data.weekStart.split('-').reverse().join('/')}
                </h2>
                <span className="meta">
                  {data.games.length} jogos · {withChannel} com canal
                </span>
              </div>
              {data.games.length ? (
                <div className="hd-table-wrap is-flat">
                  <table className="hd-table">
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Jogo</th>
                        <th>Onde passa</th>
                        <th>Fontes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.games.map((g) => (
                        <tr key={g.id}>
                          <td className="hd-mono">
                            {formatDateTime(g.startsAt)}
                          </td>
                          <td>
                            <b>{g.title}</b>
                            <span
                              className="hd-sub"
                              style={{ display: 'block' }}
                            >
                              {g.championship}
                              {g.matchedTeams
                                ? ''
                                : ' · times fora do catálogo'}
                            </span>
                          </td>
                          <td>
                            {g.channels.length ? g.channels.join(', ') : '—'}{' '}
                            {g.channels.length ? (
                              <span
                                className="hd-pill"
                                data-tone={
                                  g.channelConfirmed ? undefined : 'sand'
                                }
                              >
                                {g.channelConfirmed
                                  ? 'confirmado'
                                  : 'a conferir'}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <Sources sources={g.sources} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hd-empty">
                  Nenhum jogo nesta semana ainda. “Rodar agora” monta o
                  catálogo.
                </p>
              )}
            </section>

            {data.footballData ? (
              <p className="hd-note">
                <Icon name="doc" size={14} /> Football data provided by the
                Football-Data.org API
              </p>
            ) : null}
          </>
        )}
      </div>
    </HoudiniShell>
  )
}
