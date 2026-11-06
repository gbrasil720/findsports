import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import type {
  AnalyticsDateRange,
  AnalyticsPeriodPreset
} from '@/components/admin/analytics-period'
import { FeedbackDialog } from '@/components/app/feedback-dialog'
import {
  Arrow,
  Beer,
  Calendar,
  Gear,
  Logo,
  Medal,
  People,
  Qr,
  Ranking,
  Tv
} from '@/components/landing/v3/icons'
import { ThemeSwitch } from '@/components/landing/v3/theme-switch'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { ValidarCodigo } from './validar-codigo'

/*
 * Casca do painel do bar no redesign (WEB-501, fase 1; protótipo
 * `docs/design/redesign-2026-11/painel`, `drawNav` e `mais`): barra de tinta
 * com o bar, as seções e "Validar código"; trilho de ícones até 1180 px; no
 * celular, o topo com o bar e as abas embaixo, com "Mais". CSS em
 * `painel.css`, preso a `.pn3`. As telas antigas entram em `PainelPage`.
 */

type PainelState = {
  analyticsRange: AnalyticsDateRange
  setAnalyticsRange: (range: AnalyticsDateRange) => void
  analyticsPreset: AnalyticsPeriodPreset
  setAnalyticsPreset: (preset: AnalyticsPeriodPreset) => void
  /** Elite, ou código em aberto de quem perdeu o Elite (WEB-341). */
  showsGoing: boolean
  /** Plano e códigos em aberto já responderam: `showsGoing` é definitivo. */
  goingKnown: boolean
  elite: boolean
}

export const PainelContext = createContext<PainelState | null>(null)

export function usePainel(): PainelState {
  const state = useContext(PainelContext)
  if (!state) throw new Error('usePainel fora do layout /admin')
  return state
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '·'
  )
}

type NavItem = {
  to: string
  label: string
  icon: ReactNode
  count?: number | null
}

export function PainelShell({
  barName,
  neighborhood,
  planName,
  upcomingGames,
  goingCount,
  validating,
  onValidate,
  onCloseValidation,
  children
}: {
  barName: string
  neighborhood: string
  planName: string | null
  upcomingGames: number | null
  goingCount: number | null
  validating: boolean
  onValidate: () => void
  onCloseValidation: () => void
  children: ReactNode
}) {
  const { showsGoing } = usePainel()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const feedbackReturn = useRef<HTMLElement | null>(null)

  const nav: NavItem[] = [
    { to: '/admin', label: 'Hoje', icon: <Tv size={20} /> },
    {
      to: '/admin/jogos',
      label: 'Jogos',
      icon: <Calendar size={20} />,
      count: upcomingGames
    },
    {
      to: '/admin/desempenho',
      label: 'Desempenho',
      icon: <Ranking size={20} />
    },
    ...(showsGoing
      ? [
          {
            to: '/admin/quem-vai',
            label: 'Quem vai',
            icon: <People size={20} />,
            count: goingCount
          }
        ]
      : []),
    { to: '/admin/meu-espaco', label: 'Meu espaço', icon: <Beer size={20} /> },
    {
      to: '/admin/billing',
      label: 'Plano e cobrança',
      icon: <Medal size={20} />
    },
    {
      to: '/admin/configuracoes',
      label: 'Configurações',
      icon: <Gear size={20} />
    }
  ]

  // A quarta aba do celular: Quem vai, ou Desempenho para quem não tem.
  const fourth = showsGoing ? '/admin/quem-vai' : '/admin/desempenho'
  const tabs = nav.filter((item) =>
    ['/admin', '/admin/jogos', fourth].includes(item.to)
  )
  const onTab = tabs.some((item) => item.to === pathname)

  const openFeedback = (from: HTMLElement | null) => {
    feedbackReturn.current = from
    setFeedbackOpen(true)
  }

  // Diálogos das telas antigas abrem aqui, dentro de `.onside-app`, com os
  // estilos delas (o `ProductFrame` fazia isso).
  const portal = useRef<HTMLDivElement>(null)
  const avatar = <span className="pn-av">{initials(barName)}</span>

  return (
    <PortalProvider container={portal}>
      <div className="pn3">
        <a className="pn-skip" href="#painel-main">
          Ir para o conteúdo
        </a>
        <div className="pn-shell">
          <aside className="pn-rail" aria-label="Painel do bar">
            <Link to="/admin" className="pn-logo" aria-label="Onside, painel">
              <Logo size={26} />
              <b>
                ONSIDE<i></i>
              </b>
            </Link>
            <div className="pn-barcard">
              {avatar}
              <span className="pn-l">
                <b>{barName}</b>
                <span>{neighborhood}</span>
              </span>
              {planName ? <em>{planName}</em> : null}
            </div>
            <nav className="pn-nav" aria-label="Seções do painel">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  title={item.label}
                >
                  {item.icon}
                  <span className="pn-l">{item.label}</span>
                  {item.count ? (
                    <span className="pn-n">{item.count}</span>
                  ) : null}
                </Link>
              ))}
            </nav>
            <span className="pn-sp" />
            <button
              type="button"
              className="pn-btn pn-acid pn-vbtn"
              onClick={onValidate}
              title="Validar código"
            >
              <Qr size={20} />
              <span className="pn-l">Validar código</span>
            </button>
            <DonoMenu placement="up" onFeedback={openFeedback} />
          </aside>

          <div className="pn-col">
            <header className="pn-mtop">
              {avatar}
              <span className="pn-mtop-t">
                <b>{barName}</b>
                <span>
                  {[planName, neighborhood].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="pn-sp" />
              <DonoMenu placement="down" onFeedback={openFeedback} />
            </header>
            <main id="painel-main" className="pn-main">
              {children}
            </main>
          </div>
        </div>

        <nav className="pn-tabbar" aria-label="Seções do painel">
          {tabs.slice(0, 2).map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: true }}>
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="pn-vb"
            onClick={onValidate}
            aria-label="Validar código"
          >
            <span>
              <Qr size={26} />
            </span>
            Validar
          </button>
          {tabs.slice(2).map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: true }}>
              {item.icon}
              {item.label}
            </Link>
          ))}
          <Link
            to="/admin/mais"
            aria-current={
              !onTab && pathname !== '/admin/validate' ? 'page' : undefined
            }
          >
            <Gear size={22} />
            Mais
          </Link>
        </nav>

        <ValidarCodigo open={validating} onClose={onCloseValidation} />
        <FeedbackDialog
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          returnFocus={feedbackReturn}
        />
        <div ref={portal} className="onside-app pn-portal" />
      </div>
    </PortalProvider>
  )
}

/**
 * Menu do dono: nome e e-mail, tema, plano, landing, feedback e sair. Um
 * painel simples em vez do menu do Radix: a troca de tema é um grupo de
 * rádios, que num `role="menu"` não teria setas nem leitor de tela certos.
 */
function DonoMenu({
  placement,
  onFeedback
}: {
  placement: 'up' | 'down'
  onFeedback: (from: HTMLElement | null) => void
}) {
  const session = useSession()
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const name = session?.user?.name ?? ''
  const isAdmin = session?.user?.role === 'admin'

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`pn-dono is-${placement}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="pn-me"
        aria-expanded={open}
        aria-label={name ? `Menu da conta de ${name}` : 'Menu da conta'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pn-a">{initials(name)}</span>
        <span className="pn-l">
          <b>{name || '…'}</b>
          {session?.user?.email}
        </span>
      </button>
      {open ? (
        <nav className="pn-pop" aria-label="Conta">
          <div className="pn-pop-h">
            <b>{name || '…'}</b>
            <span>{session?.user?.email}</span>
          </div>
          <div className="pn-pop-tema">
            <span>Tema</span>
            <div className="lp3 pn-lp3">
              <ThemeSwitch variant="nav" />
            </div>
          </div>
          <Link to="/admin/billing" onClick={() => setOpen(false)}>
            Plano e cobrança
          </Link>
          <Link to="/" search={{ public: '1' }} onClick={() => setOpen(false)}>
            Ver a landing
          </Link>
          {isAdmin ? (
            <Link to="/houdini" onClick={() => setOpen(false)}>
              Houdini
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onFeedback(trigger.current)
            }}
          >
            Enviar feedback
          </button>
          <button
            type="button"
            className="pn-sair"
            onClick={() => void signOut()}
          >
            Sair
          </button>
        </nav>
      ) : null}
    </div>
  )
}

/**
 * Uma tela do painel: o título no letreiro e, por enquanto, a seção do painel
 * antigo numa folha `.onside-app` (fase 1: nada muda dentro dela). No escuro
 * a folha fica clara, para o que ainda não foi redesenhado continuar legível.
 */
export function PainelPage({
  title,
  sub,
  children
}: {
  title?: string
  sub?: string
  children: ReactNode
}) {
  return (
    <>
      {title ? (
        <div className="pn-ph">
          <h1 className="pn-disp">{title}</h1>
          {sub ? <p>{sub}</p> : null}
        </div>
      ) : null}
      <div className="onside-app pn-legado">{children}</div>
    </>
  )
}

/** A tela "Mais" do celular (protótipo `mais`). */
export function PainelMais() {
  const { showsGoing } = usePainel()
  const items: [string, string, ReactNode][] = [
    ...(showsGoing
      ? [
          [
            '/admin/desempenho',
            'Desempenho',
            <Ranking key="r" size={22} />
          ] as [string, string, ReactNode]
        ]
      : []),
    ['/admin/meu-espaco', 'Meu espaço', <Beer key="b" size={22} />],
    ['/admin/billing', 'Plano e cobrança', <Medal key="m" size={22} />],
    ['/admin/configuracoes', 'Configurações', <Gear key="g" size={22} />]
  ]
  return (
    <>
      <div className="pn-ph">
        <h1 className="pn-disp">Mais</h1>
      </div>
      <nav className="pn-more" aria-label="Mais seções">
        {items.map(([to, label, icon]) => (
          <Link key={to} to={to}>
            {icon}
            {label}
            <span>
              <Arrow size={18} />
            </span>
          </Link>
        ))}
      </nav>
      <div className="pn-more-tema">
        <span>Tema</span>
        <div className="lp3 pn-lp3">
          <ThemeSwitch />
        </div>
      </div>
    </>
  )
}
