import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

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
      timeZone: 'America/Sao_Paulo'
    })
  )
  if (hour < 5 || hour >= 18) return 'Boa noite.'
  if (hour < 12) return 'Bom dia.'
  return 'Boa tarde.'
}

function InicioPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const quiet = { meta: { errorToast: false } } as const
  const people = useQuery({
    ...trpc.adminUsers.list.queryOptions({}),
    ...quiet
  })
  const bars = useQuery({ ...trpc.adminBars.list.queryOptions({}), ...quiet })
  const ghosts = useQuery({
    ...trpc.attendance.unregisteredAlerts.queryOptions(),
    ...quiet
  })
  const spells = useQuery({ ...trpc.appConfig.list.queryOptions(), ...quiet })
  const grimorio = useQuery({
    ...trpc.grimorio.list.queryOptions({ limit: 6 }),
    ...quiet
  })

  const tiles: Array<{
    to:
      | '/houdini/pessoas'
      | '/houdini/bares'
      | '/houdini/fantasmas'
      | '/houdini/feiticos'
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
      value: people.data?.total,
      sub: people.data
        ? `${people.data.admins} admins · ${people.data.banned} sumidas`
        : ''
    },
    {
      to: '/houdini/bares',
      label: 'Bares',
      icon: 'store',
      value: bars.data?.matched,
      sub: 'planos e assinaturas'
    },
    {
      to: '/houdini/fantasmas',
      label: 'Fantasmas',
      icon: 'ghost',
      value: ghosts.data?.length,
      sub: 'bares sem registrar código',
      tone: 'var(--hd-bad)'
    },
    {
      to: '/houdini/feiticos',
      label: 'Feitiços lançados',
      icon: 'wand',
      value: spells.data?.filter((s) => s.sobrescrito).length,
      sub: spells.data ? `de ${spells.data.length} no livro` : '',
      tone: 'var(--hd-roxo)'
    }
  ]

  return (
    <HoudiniShell title="Início" env={env} user={admin}>
      <div className="hd-page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="hd-h1" style={{ fontSize: 28 }}>
            {greeting()}
          </h1>
          <p className="hd-lead">O que tem na cartola hoje.</p>
        </div>
        <div className="hd-grid" style={{ '--hd-min': '200px' } as never}>
          {tiles.map((tile) => (
            <Link
              key={tile.to}
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
