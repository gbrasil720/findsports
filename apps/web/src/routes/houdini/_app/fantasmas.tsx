import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/fantasmas')({
  head: () => ({ meta: [{ title: 'Fantasmas — Houdini' }] }),
  component: FantasmasPage
})

// As quatro leituras do cruzamento (WEB-128), na ordem do antigo painel de
// comparecimento.
const READINGS = [
  {
    key: 'bothRegistered',
    label: 'Presença confiável',
    detail: 'bar registrou, torcedor foi',
    color: 'var(--hd-acid)'
  },
  {
    key: 'unregistered',
    label: 'Bar não registra',
    detail: 'torcedor foi, bar não registrou',
    color: 'var(--hd-live)'
  },
  {
    key: 'burned',
    label: 'Código queimado',
    detail: 'bar registrou, torcedor não foi',
    color: 'var(--hd-sand)'
  },
  {
    key: 'noShow',
    label: 'No-show',
    detail: 'nenhum dos dois',
    color: 'var(--hd-muted)'
  }
] as const

function FantasmasPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const alerts = useQuery({
    ...trpc.attendance.unregisteredAlerts.queryOptions(),
    meta: { errorToast: false }
  })

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Pede atenção"
          title="Fantasmas"
          summary="Bares em que o torcedor disse que foi e o bar não registrou o código em vários jogos. Só entram jogos com a janela de validação encerrada. As duas fontes são declaradas: o cruzamento aponta padrão, não prova."
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            fontSize: 13,
            color: 'var(--hd-body)'
          }}
        >
          {READINGS.map((r) => (
            <span
              key={r.key}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: r.color
                }}
              />
              {r.label}{' '}
              <span style={{ color: 'var(--hd-muted)' }}>({r.detail})</span>
            </span>
          ))}
        </div>

        {alerts.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                alerts.error,
                'Não foi possível carregar os fantasmas.'
              )}
            </p>
          </div>
        ) : alerts.isLoading ? (
          <div className="hd-skeleton" style={{ height: 160 }} />
        ) : !alerts.data?.length ? (
          <p className="hd-empty is-dashed">Nenhum fantasma por aqui.</p>
        ) : (
          <div className="hd-grid" style={{ '--hd-min': '360px' } as never}>
            {alerts.data.map((alert) => {
              const total = READINGS.reduce((n, r) => n + alert[r.key], 0)
              return (
                <article
                  key={alert.barId}
                  className="hd-card is-live"
                  style={{ gap: 14 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start'
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        flex: '0 0 auto',
                        background: 'var(--hd-live)',
                        color: '#fff'
                      }}
                    >
                      <Icon name="ghost" size={18} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h2 className="hd-h2">{alert.barName}</h2>
                      <span style={{ fontSize: 13, color: 'var(--hd-muted)' }}>
                        {alert.unregisteredGames} jogos com “foi, mas não
                        registrou”
                      </span>
                    </div>
                  </div>
                  {total > 0 ? (
                    <div
                      role="img"
                      aria-label={READINGS.map(
                        (r) => `${r.label}: ${alert[r.key]}`
                      ).join(', ')}
                      style={{
                        display: 'flex',
                        gap: 2,
                        height: 8,
                        borderRadius: 3,
                        overflow: 'hidden'
                      }}
                    >
                      {READINGS.map((r) =>
                        alert[r.key] > 0 ? (
                          <span
                            key={r.key}
                            style={{
                              flex: `${alert[r.key]} 1 0`,
                              background: r.color
                            }}
                          />
                        ) : null
                      )}
                    </div>
                  ) : null}
                  <dl
                    className="hd-dl"
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(110px, 1fr))'
                    }}
                  >
                    {READINGS.map((r) => (
                      <div key={r.key}>
                        <dt>{r.label}</dt>
                        <dd className="hd-mono">{alert[r.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              )
            })}
          </div>
        )}
        <p className="hd-note">
          Registra e não julga: nada aqui avisa o bar nem identifica quem
          respondeu.
        </p>
      </div>
    </HoudiniShell>
  )
}
