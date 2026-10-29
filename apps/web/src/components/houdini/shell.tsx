import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import type { HoudiniEnv } from '@/functions/houdini-gate'
import { roleLabel } from '@/lib/roles'
import { useTRPC } from '@/utils/trpc'
import { initials } from './format'
import { HatIcon, Icon, type IconName } from './icons'

/** O trilho, em grupos. Ticket novo do Houdini acrescenta a sua seção aqui. */
export const HOUDINI_NAV_GROUPS = [
  {
    label: 'Hoje',
    items: [{ to: '/houdini', label: 'Início', icon: 'home', exact: true }]
  },
  {
    label: 'Gente e bares',
    items: [
      { to: '/houdini/pessoas', label: 'Pessoas', icon: 'users' },
      { to: '/houdini/bares', label: 'Bares', icon: 'store' },
      { to: '/houdini/jogos', label: 'Jogos', icon: 'cal' }
    ]
  },
  {
    label: 'Pede atenção',
    items: [
      {
        to: '/houdini/ampulheta',
        label: 'Ampulheta',
        icon: 'hourglass',
        hint: 'testes acabando'
      },
      { to: '/houdini/fantasmas', label: 'Fantasmas', icon: 'ghost' },
      {
        to: '/houdini/revisao',
        label: 'Revisão',
        icon: 'check',
        hint: 'fotos e descrições dos bares'
      }
    ]
  },
  {
    label: 'Máquina',
    items: [
      { to: '/houdini/feiticos', label: 'Feitiços', icon: 'wand' },
      {
        to: '/houdini/ia',
        label: 'IA',
        icon: 'spark',
        hint: 'gasto e testes A/B'
      },
      { to: '/houdini/bastidores', label: 'Bastidores', icon: 'pulse' }
    ]
  },
  {
    label: 'Registro',
    items: [
      {
        to: '/houdini/grimorio',
        label: 'Grimório',
        icon: 'book',
        hint: 'registro dos truques'
      }
    ]
  }
] as const satisfies ReadonlyArray<{
  label: string
  items: ReadonlyArray<{
    to: string
    label: string
    icon: IconName
    exact?: boolean
    hint?: string
  }>
}>

type NavItem = (typeof HOUDINI_NAV_GROUPS)[number]['items'][number]

export const HOUDINI_NAV = HOUDINI_NAV_GROUPS.flatMap(
  (group): ReadonlyArray<NavItem> => group.items
)

type NavTo = (typeof HOUDINI_NAV)[number]['to']
type Count = { text: string; tone?: 'live' | 'acid' }

const ENVS: Record<HoudiniEnv, { name: string; host: string; note: string }> = {
  produção: {
    name: 'Produção',
    host: 'houdini.onside.sh',
    note: 'O que você faz aqui vale de verdade e vai para o Grimório'
  },
  preview: {
    name: 'Preview',
    host: 'onside-web-preview/houdini',
    note: 'Banco é cópia de produção · nenhum e-mail sai daqui'
  },
  local: {
    name: 'Local',
    host: 'localhost',
    note: 'Banco de desenvolvimento'
  }
}

/** Os números ao lado de cada seção, do mesmo `houdini.overview` do Início. */
function useNavCounts(): Partial<Record<NavTo, Count>> {
  const trpc = useTRPC()
  const { data: o } = useQuery({
    ...trpc.houdini.overview.queryOptions(),
    staleTime: 30_000,
    meta: { errorToast: false }
  })
  if (!o) return {}
  const alert = (n: number, tone: Count['tone']): Count | undefined =>
    n > 0 ? { text: String(n), tone } : undefined
  return {
    '/houdini/pessoas': { text: String(o.people.total) },
    '/houdini/bares': { text: String(o.bars.noAr) },
    '/houdini/jogos': { text: String(o.jogosFuturos) },
    '/houdini/ampulheta': alert(o.testesAcabando, 'acid'),
    '/houdini/fantasmas': alert(o.fantasmas, 'live'),
    '/houdini/feiticos': o.feiticosLancados
      ? { text: `${o.feiticosLancados} no ar` }
      : undefined,
    '/houdini/revisao': alert(o.revisao, 'acid'),
    '/houdini/bastidores': alert(o.rotinasFalhando, 'live')
  }
}

function NavGroups({
  label,
  counts,
  onNavigate
}: {
  label: string
  counts: Partial<Record<NavTo, Count>>
  onNavigate?: () => void
}) {
  return (
    <nav aria-label={label} className="hd-nav">
      {HOUDINI_NAV_GROUPS.map((group) => (
        <div key={group.label} style={{ display: 'contents' }}>
          <span className="hd-nav-label">{group.label}</span>
          {group.items.map((item) => {
            const count = counts[item.to]
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: 'exact' in item && item.exact }}
                activeProps={{ 'aria-current': 'page' }}
                onClick={onNavigate}
              >
                <Icon name={item.icon} />
                {item.label}
                {count ? (
                  <span className="hd-count" data-tone={count.tone}>
                    {count.text}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Brand({ size = 34 }: { size?: number }) {
  return (
    <Link to="/houdini" aria-label="Houdini, início" className="hd-brand">
      <HatIcon size={size} />
      <span>
        <span className="hd-brand-word">Houdini</span>
        <span className="hd-brand-sub">Onside · interno</span>
      </span>
    </Link>
  )
}

function Me({ name }: { name: string }) {
  return (
    <div className="hd-me">
      <span className="hd-avatar">{initials(name)}</span>
      <span style={{ minWidth: 0 }}>
        <b>{name}</b>
        <span>admin · 2FA ligado</span>
      </span>
    </div>
  )
}

export function HoudiniShell({
  env,
  user,
  children
}: {
  env: HoudiniEnv
  user: { name: string }
  children: ReactNode
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const counts = useNavCounts()
  const e = ENVS[env]

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
    <>
      <div className="hd-env" data-env={env}>
        <span className="hd-env-dot" />
        {e.name}
        <span className="hd-env-host">{e.host}</span>
        <span className="hd-env-note">{e.note}</span>
      </div>
      <div className="hd-app">
        <aside className="hd-side">
          <Brand />
          <NavGroups label="Seções do Houdini" counts={counts} />
          <div className="hd-side-foot">
            <button
              type="button"
              className="hd-btn hd-btn-primary is-lg is-block"
              onClick={() => setPaletteOpen(true)}
            >
              <Icon name="wand" size={18} />
              Abracadabra
              <kbd className="hd-kbd">⌘K</kbd>
            </button>
            <Me name={user.name} />
          </div>
        </aside>

        <div className="hd-main">
          <div className="hd-mtop">
            <Brand size={30} />
            <span className="hd-avatar" role="img" aria-label={user.name}>
              {initials(user.name)}
            </span>
          </div>
          {children}
        </div>
      </div>

      <nav aria-label="Seções do Houdini" className="hd-dock">
        <Link
          to="/houdini"
          activeOptions={{ exact: true }}
          activeProps={{ 'aria-current': 'page' }}
        >
          <Icon name="home" />
          Início
        </Link>
        <Link to="/houdini/pessoas" activeProps={{ 'aria-current': 'page' }}>
          <Icon name="users" />
          Pessoas
        </Link>
        <button
          type="button"
          className="hd-dock-abra"
          aria-label="Abracadabra"
          onClick={() => setPaletteOpen(true)}
        >
          <Icon name="wand" size={24} />
        </button>
        <Link to="/houdini/bares" activeProps={{ 'aria-current': 'page' }}>
          <Icon name="store" />
          Bares
        </Link>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="menu" />
          Mais
        </button>
      </nav>

      {moreOpen ? (
        <Sheet label="Mais seções" onClose={() => setMoreOpen(false)}>
          <NavGroups
            label="Todas as seções"
            counts={counts}
            onNavigate={() => setMoreOpen(false)}
          />
          <Me name={user.name} />
        </Sheet>
      ) : null}

      {paletteOpen ? (
        <Abracadabra onClose={() => setPaletteOpen(false)} />
      ) : null}
    </>
  )
}

/** Folha que sobe do pé da tela no celular: o "Mais" da barra. */
function Sheet({
  label,
  onClose,
  children
}: {
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o clique é no fundo, fora da folha; pelo teclado, o Esc do <dialog> fecha.
    <dialog
      ref={ref}
      aria-label={label}
      className="hd-more"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </dialog>
  )
}

/**
 * Cabeçalho de cada tela: a linha de cima (o grupo do trilho, ou o caminho
 * numa ficha), o título em Anton, o resumo e as ações à direita.
 */
export function PageHead({
  overline,
  crumbs,
  title,
  titleId,
  size,
  summary,
  actions,
  children
}: {
  overline?: ReactNode
  crumbs?: ReadonlyArray<{ label: string; to: NavTo }>
  title: ReactNode
  titleId?: string
  size?: 'md' | 'sm'
  summary?: ReactNode
  actions?: ReactNode
  /** O que vai debaixo do resumo, dentro da coluna do título. */
  children?: ReactNode
}) {
  return (
    <header className="hd-head">
      <div className="hd-head-text">
        {crumbs ? (
          <nav className="hd-crumbs" aria-label="Caminho">
            {crumbs.map((crumb) => (
              <span key={crumb.to} style={{ display: 'contents' }}>
                <Link to={crumb.to}>{crumb.label}</Link>
                <span className="hd-sep">/</span>
              </span>
            ))}
            <span>{title}</span>
          </nav>
        ) : overline ? (
          <span className="hd-overline">{overline}</span>
        ) : null}
        <h1 id={titleId} className={size ? `hd-h1 is-${size}` : 'hd-h1'}>
          {title}
        </h1>
        {summary ? <p className="hd-lead">{summary}</p> : null}
        {children}
      </div>
      {actions ? <div className="hd-actions">{actions}</div> : null}
    </header>
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
 * ⌘K: do servidor (`houdini.search`), pessoa por nome, e-mail, id ou `cus_…`
 * e bar por nome ou id; depois as seções pelo nome. O resultado abre a ficha.
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
    const sections = HOUDINI_NAV.filter(
      (item) => !q || normalize(item.label).includes(q)
    ).map((item) => ({
      key: item.to,
      group: 'Seções' as const,
      icon: item.icon,
      label: item.label,
      hint: 'hint' in item ? item.hint : undefined,
      go: () => void navigate({ to: item.to })
    }))
    return [...people, ...bars, ...sections]
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
          borderBottom: '1px solid var(--hd-line)'
        }}
      >
        <span className="hd-spark" style={{ display: 'inline-flex' }}>
          <Icon name="wand" />
        </span>
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
        <kbd className="hd-kbd is-line">esc</kbd>
      </div>
      <div
        role="listbox"
        aria-label="Resultados"
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(60dvh, 460px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 6
        }}
      >
        {items.length === 0 ? (
          <p className="hd-empty" style={{ margin: 8 }}>
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
                  className="hd-eyebrow"
                  style={{ padding: '12px 12px 6px' }}
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
                <span
                  style={{
                    display: 'inline-flex',
                    flexShrink: 0,
                    color: 'var(--hd-muted)'
                  }}
                >
                  <Icon name={item.icon} size={18} />
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
                      fontSize: 12,
                      fontWeight: 400,
                      color: 'var(--hd-muted)'
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
          flexWrap: 'wrap',
          gap: 18,
          padding: '10px 18px',
          borderTop: '1px solid var(--hd-line)',
          fontSize: 11.5,
          color: 'var(--hd-muted)'
        }}
      >
        <span>↑↓ escolher</span>
        <span>↵ abrir</span>
        <span style={{ marginLeft: 'auto' }}>esc some</span>
      </div>
    </dialog>
  )
}
