import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import type { HoudiniEnv } from '@/functions/houdini-gate'
import { roleLabel } from '@/lib/roles'
import { useTRPC } from '@/utils/trpc'
import { initials } from './format'
import { HatIcon, Icon, type IconName } from './icons'

/** As seções do trilho. Ticket novo do Houdini acrescenta a sua aqui. */
export const HOUDINI_NAV = [
  { to: '/houdini', label: 'Início', icon: 'home', exact: true },
  { to: '/houdini/pessoas', label: 'Pessoas', icon: 'users' },
  { to: '/houdini/feiticos', label: 'Feitiços', icon: 'wand' },
  { to: '/houdini/fantasmas', label: 'Fantasmas', icon: 'ghost' },
  { to: '/houdini/bares', label: 'Bares', icon: 'store' },
  { to: '/houdini/grimorio', label: 'Grimório', icon: 'book' }
] as const satisfies ReadonlyArray<{
  to: string
  label: string
  icon: IconName
  exact?: boolean
}>

type NavTo = (typeof HOUDINI_NAV)[number]['to']

export function HoudiniShell({
  title,
  crumbs = [],
  env,
  user,
  children
}: {
  title: string
  crumbs?: ReadonlyArray<{ label: string; to: NavTo }>
  env: HoudiniEnv
  user: { name: string }
  children: ReactNode
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hd-app">
      <nav aria-label="Seções do Houdini" className="hd-rail">
        <Link to="/houdini" aria-label="Houdini, início" className="hd-logo">
          <HatIcon size={26} />
        </Link>
        {HOUDINI_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: 'exact' in item && item.exact }}
            className="hd-rail-item"
            aria-label={item.label}
          >
            <Icon name={item.icon} />
            <span className="hd-tip" aria-hidden="true">
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="hd-main">
        <header className="hd-top">
          <span className="hd-crumbs">
            Houdini
            {crumbs.map((crumb) => (
              <span key={crumb.to}>
                <span className="hd-sep">/</span>
                <Link to={crumb.to} style={{ textDecoration: 'none' }}>
                  {crumb.label}
                </Link>
              </span>
            ))}
            <span className="hd-sep">/</span>
            <strong>{title}</strong>
          </span>
          <button
            type="button"
            className="hd-search"
            onClick={() => setPaletteOpen(true)}
          >
            <Icon name="wand" size={16} strokeWidth={1.8} />
            <span style={{ flexGrow: 1 }}>Abracadabra… pessoa, bar, seção</span>
            <kbd className="hd-kbd">⌘K</kbd>
          </button>
          <span className="hd-env" data-env={env}>
            {env}
          </span>
          <span className="hd-avatar" role="img" aria-label={user.name}>
            {initials(user.name)}
          </span>
        </header>
        {children}
      </div>

      {paletteOpen ? (
        <Abracadabra onClose={() => setPaletteOpen(false)} />
      ) : null}
    </div>
  )
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

type PaletteItem = {
  key: string
  group: 'Seções' | 'Pessoas' | 'Bares'
  icon: IconName
  label: string
  hint?: string
  go: () => void
}

/** Espera a pessoa parar de digitar antes de ir ao servidor. */
const SEARCH_DEBOUNCE_MS = 200

/**
 * ⌘K: seções pelo nome e, do servidor (`houdini.search`), pessoa por nome,
 * e-mail, id ou `cus_…` e bar por nome ou id. O resultado abre a ficha.
 */
function Abracadabra({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(query.trim()),
      SEARCH_DEBOUNCE_MS
    )
    return () => clearTimeout(timer)
  }, [query])

  const search = useQuery({
    ...trpc.houdini.search.queryOptions({ q: debounced }),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const found = debounced.length >= 2 ? search.data : undefined

  const items = useMemo<PaletteItem[]>(() => {
    const q = normalize(query.trim())
    const sections = HOUDINI_NAV.filter(
      (item) => !q || normalize(item.label).includes(q)
    ).map((item) => ({
      key: item.to,
      group: 'Seções' as const,
      icon: item.icon,
      label: item.label,
      go: () => void navigate({ to: item.to })
    }))
    const people = (found?.people ?? []).map((person) => ({
      key: `p:${person.id}`,
      group: 'Pessoas' as const,
      icon: 'users' as const,
      label: person.name || person.email,
      hint: `${person.email} · ${roleLabel(person.role)}`,
      go: () =>
        void navigate({
          to: '/houdini/pessoas',
          search: { pessoa: person.id }
        })
    }))
    const bars = (found?.bars ?? []).map((bar) => ({
      key: `b:${bar.id}`,
      group: 'Bares' as const,
      icon: 'store' as const,
      label: bar.name,
      hint: `${bar.neighborhood}, ${bar.city}`,
      go: () => void navigate({ to: '/houdini/bares', search: { bar: bar.id } })
    }))
    return [...sections, ...people, ...bars]
  }, [query, found, navigate])

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  // Os resultados do servidor chegam depois da tecla: a seleção não pode
  // apontar para além da lista.
  const current = Math.min(active, items.length - 1)

  function go(index: number) {
    const item = items[index]
    if (!item) return
    onClose()
    item.go()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Abracadabra"
      className="hd-palette"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActive(Math.min(current + 1, Math.max(items.length - 1, 0)))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive(Math.max(current - 1, 0))
        } else if (event.key === 'Enter') {
          event.preventDefault()
          go(current)
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 18px',
          borderBottom: '1px solid var(--hd-line)',
          color: 'var(--hd-roxo)'
        }}
      >
        <Icon name="wand" size={18} strokeWidth={1.8} />
        <label htmlFor="hd-abra" className="hd-sr">
          Abracadabra
        </label>
        <input
          id="hd-abra"
          className="hd-palette-input"
          placeholder="Nome, e-mail, id ou cus_…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
        />
      </div>
      <div
        role="listbox"
        aria-label="Resultados"
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(60vh, 440px)',
          overflowY: 'auto',
          padding: 6
        }}
      >
        {items.length === 0 ? (
          <p className="hd-empty">
            {search.isFetching
              ? 'Procurando na cartola…'
              : 'Nada sai da cartola com esse nome.'}
          </p>
        ) : (
          items.map((item, index) => (
            <div
              key={item.key}
              role="presentation"
              style={{ display: 'contents' }}
            >
              {item.group !== items[index - 1]?.group ? (
                <span
                  className="hd-mono"
                  style={{
                    padding: '10px 12px 4px',
                    fontSize: 11,
                    color: 'var(--hd-faint)'
                  }}
                >
                  {item.group}
                </span>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={index === current}
                className="hd-palette-item"
                ref={(node) => {
                  if (index === current)
                    node?.scrollIntoView({ block: 'nearest' })
                }}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(index)}
              >
                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                  <Icon name={item.icon} size={16} />
                </span>
                <span
                  style={{
                    flex: '1 0 auto',
                    maxWidth: '60%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.label}
                </span>
                {item.hint ? (
                  <span
                    className="hd-mono"
                    style={{
                      flex: '0 1 auto',
                      minWidth: 0,
                      marginLeft: 'auto',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      color: 'var(--hd-faint)'
                    }}
                  >
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </div>
          ))
        )}
      </div>
      <div
        className="hd-mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 18px',
          borderTop: '1px solid var(--hd-line)',
          fontSize: 11,
          color: 'var(--hd-faint)'
        }}
      >
        <span>↑↓ escolher · ↵ ir · esc some</span>
      </div>
    </dialog>
  )
}
