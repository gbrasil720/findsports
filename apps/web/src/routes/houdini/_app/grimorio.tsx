import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { type GrimorioEntry, GrimorioRow } from '@/components/houdini/grimorio'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/grimorio')({
  head: () => ({ meta: [{ title: 'Grimório — Houdini' }] }),
  component: GrimorioPage
})

const FILTERS = [
  { label: 'Tudo', kinds: undefined },
  {
    label: 'Na pele',
    kinds: [
      'user.impersonate',
      'user.stop_impersonating',
      'user.impersonation_mode'
    ]
  },
  { label: 'Sumiços', kinds: ['user.ban', 'user.unban'] },
  { label: 'Roles', kinds: ['user.set_role'] },
  { label: 'Feitiços', kinds: ['config.set', 'config.reset'] },
  {
    label: 'Bares',
    kinds: [
      'bar.sync_search',
      'bar.extend_trial',
      'bar.take_off_air',
      'bar.put_on_air'
    ]
  },
  { label: 'Jogos', kinds: ['event.update', 'event.delete', 'event.fix'] }
] as const

const TZ = 'America/Sao_Paulo'

/** "qui, 22 out", no calendário de Brasília. */
function shortDay(date: Date) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    date
      .toLocaleDateString('pt-BR', { ...options, timeZone: TZ })
      .replace('.', '')
  return `${part({ weekday: 'short' })}, ${part({ day: 'numeric' })} ${part({ month: 'short' })}`
}

/** "Hoje" e "Ontem" com a data ao lado; antes disso, a data é o título. */
function dayOf(value: Date | string, now = new Date()) {
  const date = new Date(value)
  const day = shortDay(date)
  if (day === shortDay(now)) return { label: 'Hoje', date: day }
  if (day === shortDay(new Date(now.getTime() - 86_400_000)))
    return { label: 'Ontem', date: day }
  return { label: day, date: null }
}

function byDay(entries: GrimorioEntry[]) {
  const groups: Array<{
    label: string
    date: string | null
    entries: GrimorioEntry[]
  }> = []
  for (const entry of entries) {
    const day = dayOf(entry.createdAt)
    const last = groups.at(-1)
    if (last?.label === day.label) last.entries.push(entry)
    else groups.push({ ...day, entries: [entry] })
  }
  return groups
}

function GrimorioPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const [filter, setFilter] = useState(0)
  const kinds = FILTERS[filter]?.kinds

  const query = useInfiniteQuery({
    ...trpc.grimorio.list.infiniteQueryOptions(
      { kinds: kinds ? [...kinds] : undefined },
      {
        getNextPageParam: (last) => last.nextCursor ?? undefined
      }
    ),
    meta: { errorToast: false }
  })
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? []

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page" style={{ maxWidth: 1052 }}>
        <PageHead
          overline="Registro"
          title="Grimório"
          summary="Todo truque feito no Houdini fica escrito aqui: quem, quando, em quem e o que mudou."
          actions={
            <span className="hd-pill is-lg">
              <Icon name="lock" size={16} />
              só se escreve · nem admin apaga
            </span>
          }
        />
        <fieldset className="hd-seg" aria-label="Filtrar por truque">
          {FILTERS.map((f, index) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={filter === index}
              onClick={() => setFilter(index)}
            >
              {f.label}
            </button>
          ))}
        </fieldset>

        {query.isError ? (
          <div className="hd-card" role="alert">
            {getUserFacingMessage(
              query.error,
              'Não foi possível abrir o Grimório.'
            )}
          </div>
        ) : query.isLoading ? (
          <div className="hd-skeleton" style={{ height: 200 }} />
        ) : entries.length === 0 ? (
          <p className="hd-empty is-dashed">Nenhum truque escrito ainda.</p>
        ) : (
          byDay(entries).map((group) => (
            <section
              key={group.label}
              aria-label={group.label}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <h2
                  style={{
                    font: '400 26px/1 var(--hd-display)',
                    textTransform: 'uppercase'
                  }}
                >
                  {group.label}
                </h2>
                {group.date ? (
                  <span className="hd-mono hd-small">{group.date}</span>
                ) : null}
              </div>
              <div className="hd-card" style={{ padding: '4px 20px', gap: 0 }}>
                {group.entries.map((entry) => (
                  <GrimorioRow key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ))
        )}
        {query.hasNextPage ? (
          <button
            type="button"
            className="hd-btn"
            style={{ alignSelf: 'flex-start' }}
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Lendo…' : 'Páginas mais antigas'}
          </button>
        ) : null}
      </div>
    </HoudiniShell>
  )
}
