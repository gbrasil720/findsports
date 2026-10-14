import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { type GrimorioEntry, GrimorioRow } from '@/components/houdini/grimorio'
import { HoudiniShell } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/grimorio')({
  head: () => ({ meta: [{ title: 'Grimório — Houdini' }] }),
  component: GrimorioPage
})

const FILTERS = [
  { label: 'Tudo', kinds: undefined },
  { label: 'Na pele', kinds: ['user.impersonate', 'user.stop_impersonating'] },
  { label: 'Sumiços', kinds: ['user.ban', 'user.unban'] },
  { label: 'Roles', kinds: ['user.set_role'] },
  { label: 'Feitiços', kinds: ['config.set', 'config.reset'] }
] as const

function dayLabel(date: Date | string) {
  const day = new Date(date).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  })
  const today = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  })
  return day === today ? 'Hoje' : day
}

function byDay(entries: GrimorioEntry[]) {
  const groups: Array<{ day: string; entries: GrimorioEntry[] }> = []
  for (const entry of entries) {
    const day = dayLabel(entry.createdAt)
    const last = groups.at(-1)
    if (last?.day === day) last.entries.push(entry)
    else groups.push({ day, entries: [entry] })
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
        getNextPageParam: (last) =>
          last.hasMore ? last.entries.at(-1)?.createdAt : undefined
      }
    ),
    meta: { errorToast: false }
  })
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? []

  return (
    <HoudiniShell title="Grimório" env={env} user={admin}>
      <div className="hd-page" style={{ maxWidth: 920 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="hd-h1">Grimório</h1>
          <p className="hd-lead">
            Todo truque feito no Houdini fica escrito aqui: quem, quando, em
            quem e o que mudou. Só se escreve: nem admin apaga uma linha.
          </p>
        </div>
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
          <div className="hd-card hd-empty">Nenhum truque escrito ainda.</div>
        ) : (
          byDay(entries).map((group) => (
            <section
              key={group.day}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <h2
                style={{
                  margin: '0 0 4px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--hd-faint)'
                }}
              >
                {group.day}
              </h2>
              {group.entries.map((entry) => (
                <GrimorioRow key={entry.id} entry={entry} />
              ))}
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
