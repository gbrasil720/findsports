import { Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import type { HoudiniEnv } from '@/functions/houdini-gate'
import { initials } from './format'
import { HatIcon, Icon, type IconName } from './icons'

/** As seções do trilho. Ticket novo do Houdini acrescenta a sua aqui. */
export const HOUDINI_NAV = [
  { to: '/houdini', label: 'Início', icon: 'home', exact: true },
  { to: '/houdini/pessoas', label: 'Pessoas', icon: 'users' },
  { to: '/houdini/feiticos', label: 'Feitiços', icon: 'wand' },
  { to: '/houdini/fantasmas', label: 'Fantasmas', icon: 'ghost' },
  { to: '/houdini/bares', label: 'Bares', icon: 'store' }
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
            <span style={{ flexGrow: 1 }}>Abracadabra… ir para uma seção</span>
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

/**
 * ⌘K. Nesta entrega só navega entre as seções; a busca por pessoa, bar e id
 * entra no WEB-391.
 */
function Abracadabra({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo(() => {
    const q = normalize(query.trim())
    return HOUDINI_NAV.filter((item) => !q || normalize(item.label).includes(q))
  }, [query])

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function go(index: number) {
    const item = items[index]
    if (!item) return
    onClose()
    void navigate({ to: item.to })
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
          setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive((i) => Math.max(i - 1, 0))
        } else if (event.key === 'Enter') {
          event.preventDefault()
          go(active)
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
          placeholder="Para onde?"
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
        aria-label="Seções"
        style={{ display: 'flex', flexDirection: 'column', padding: 6 }}
      >
        {items.length === 0 ? (
          <p className="hd-empty">Nada sai da cartola com esse nome.</p>
        ) : (
          items.map((item, index) => (
            <button
              key={item.to}
              type="button"
              role="option"
              aria-selected={index === active}
              className="hd-palette-item"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(index)}
            >
              <Icon name={item.icon} size={16} />
              <span style={{ flexGrow: 1 }}>{item.label}</span>
            </button>
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
