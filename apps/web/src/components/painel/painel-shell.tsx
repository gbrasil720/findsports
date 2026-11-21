import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import {
  Tooltip,
  TooltipPopup,
  TooltipPortal,
  TooltipPositioner,
  TooltipProvider,
  TooltipTrigger
} from '@findsports_oficial/ui/components/tooltip'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
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
import {
  animarTrilho,
  aplicarTrilho,
  type Borda,
  ehAtalhoTrilho,
  gravarRecolhida,
  LARGO,
  lerRecolhida,
  medirBorda,
  TRILHO_SCRIPT,
  valorTrilho
} from './trilho'
import { ValidarCodigo } from './validar-codigo'

/*
 * Casca do painel do bar no redesign (WEB-501, fase 1; protótipo
 * `docs/design/redesign-2026-11/painel`, `drawNav` e `mais`): barra de tinta
 * com o bar, as seções e "Validar código"; trilho de ícones até 1180 px; no
 * celular, o topo com o bar e as abas embaixo, com "Mais". CSS em
 * `painel.css`, preso a `.pn3`.
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
  /** Abre a caixa "Validar código" da casca. */
  openValidation: () => void
}

export const PainelContext = createContext<PainelState | null>(null)

export function usePainel(): PainelState {
  const state = useContext(PainelContext)
  if (!state) throw new Error('usePainel fora do layout /admin')
  return state
}

/**
 * Interruptor do painel (protótipo `.tg`): botão com `role="switch"`. Quem
 * chama grava; `ocupado` trava o toque enquanto o servidor responde.
 */
export function Interruptor({
  ligado,
  onChange,
  rotulo,
  disabled
}: {
  ligado: boolean
  onChange: (ligado: boolean) => void
  rotulo: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      className="pn-tg"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
    />
  )
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
  const nonce = useRouter().options.ssr?.nonce
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const feedbackReturn = useRef<HTMLElement | null>(null)
  const trilho = useTrilho(pathname)

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
  // O nome de cada peça do trilho, só com a sidebar recolhida.
  const dica = { rail: trilho.rail, ativa: !trilho.expandida }

  return (
    <PortalProvider container={portal}>
      <div className="pn3">
        <a className="pn-skip" href="#painel-main">
          Ir para o conteúdo
        </a>
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: texto fixo do próprio app, sem dado de fora
          dangerouslySetInnerHTML={{ __html: TRILHO_SCRIPT }}
        />
        <div className="pn-shell">
          {/* Sempre na página, para esmaecer ao abrir e ao fechar; o CSS só
              o mostra com a sidebar aberta por cima (`sobre`). */}
          <button
            type="button"
            className="pn-veu"
            tabIndex={-1}
            aria-hidden={!trilho.sobre}
            aria-label="Fechar menu"
            onClick={trilho.fechar}
          />
          <TooltipProvider>
            <aside
              className="pn-rail"
              aria-label="Painel do bar"
              ref={trilho.rail}
            >
              <div className="pn-top">
                <Link
                  to="/admin"
                  className="pn-logo"
                  aria-label="Onside, painel"
                >
                  <Logo size={26} />
                  <b>
                    ONSIDE<i></i>
                  </b>
                </Link>
                <DicaTrilho
                  {...dica}
                  texto={
                    trilho.expandida ? 'Recolher menu  [' : 'Abrir menu  ['
                  }
                  render={
                    <button
                      ref={trilho.botao}
                      type="button"
                      className="pn-tgl"
                      aria-expanded={trilho.expandida}
                      aria-controls="painel-secoes"
                      aria-keyshortcuts="["
                      aria-label={
                        trilho.expandida ? 'Recolher menu' : 'Abrir menu'
                      }
                      onClick={() => trilho.alternar(false)}
                    >
                      <IconeTrilho />
                    </button>
                  }
                />
              </div>
              <DicaTrilho
                {...dica}
                texto={[barName, planName].filter(Boolean).join(' · ')}
                render={
                  // No trilho só o avatar aparece: o foco é o que mostra o
                  // nome a quem navega pelo teclado.
                  <div
                    className="pn-barcard"
                    tabIndex={trilho.expandida ? undefined : 0}
                  >
                    {avatar}
                    <span className="pn-l">
                      <b>{barName}</b>
                      {/* O selo vai na linha do bairro: ao lado do nome ele
                        cortava os dois, e o "Starter" é o mais largo. */}
                      <span className="pn-bc-sub">
                        <span>{neighborhood}</span>
                        {planName ? <em>{planName}</em> : null}
                      </span>
                    </span>
                  </div>
                }
              />
              <nav
                id="painel-secoes"
                className="pn-nav"
                aria-label="Seções do painel"
              >
                {nav.map((item) => (
                  <DicaTrilho
                    key={item.to}
                    {...dica}
                    texto={
                      item.count ? `${item.label} · ${item.count}` : item.label
                    }
                    render={
                      <Link to={item.to} activeOptions={{ exact: true }}>
                        {item.icon}
                        <span className="pn-l">{item.label}</span>
                        {item.count ? (
                          <span className="pn-n">{item.count}</span>
                        ) : null}
                      </Link>
                    }
                  />
                ))}
              </nav>
              <span className="pn-sp" />
              <DicaTrilho
                {...dica}
                texto="Validar código"
                render={
                  <button
                    type="button"
                    className="pn-btn pn-acid pn-vbtn"
                    onClick={onValidate}
                  >
                    <Qr size={20} />
                    <span className="pn-l">Validar código</span>
                  </button>
                }
              />
              <DonoMenu placement="up" onFeedback={openFeedback} dica={dica} />
            </aside>
          </TooltipProvider>

          <div className="pn-col" ref={trilho.col}>
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

/** O ícone do botão de recolher: a sidebar com a seta para onde ela vai. */
function IconeTrilho() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3.5" />
      <path d="M9 4v16" />
      {/* Uma seta só, que o CSS gira: aberta aponta para a esquerda. */}
      <path className="pn-tgl-seta" d="M13.5 10l2 2-2 2" />
    </svg>
  )
}

/**
 * Estado da sidebar recolhível (`trilho.ts`). Recolher e abrir pelo clique
 * animam sem animar largura: o layout muda uma vez, no primeiro quadro, e a
 * borda da sidebar e o conteúdo partem de onde estavam (`animarTrilho`). O
 * atalho `[` e o Esc trocam seco.
 */
function useTrilho(pathname: string) {
  const [pronto, setPronto] = useState(false)
  const [largo, setLargo] = useState(true)
  const [recolhida, setRecolhida] = useState(false)
  const [sobre, setSobre] = useState(false)
  const rail = useRef<HTMLElement>(null)
  const col = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  // Onde a borda e o conteúdo estavam antes da troca; nulo = sem animação.
  const antes = useRef<Borda | null>(null)

  useLayoutEffect(() => {
    const mq = matchMedia(LARGO)
    setLargo(mq.matches)
    setRecolhida(lerRecolhida())
    setPronto(true)
    const onChange = () => {
      setLargo(mq.matches)
      setSobre(false)
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      aplicarTrilho(null)
    }
  }, [])

  useLayoutEffect(() => {
    if (!pronto) return
    const de = antes.current
    antes.current = null
    // Troca no meio de outra parte de onde a anterior estava (`de`, medido
    // com ela rodando) e a cancela antes de medir o destino.
    // Só o que é da troca: a sidebar, o deslocamento do conteúdo e o véu.
    // `@keyframes` (esqueleto, avisos) ficam, que cancelados não voltam.
    const parar = () => {
      const veu = col.current?.parentElement?.querySelector('.pn-veu')
      for (const a of [
        ...(rail.current?.getAnimations({ subtree: true }) ?? []),
        ...(col.current?.getAnimations() ?? []),
        ...(veu?.getAnimations() ?? [])
      ]) {
        if (!(a instanceof CSSAnimation)) a.cancel()
      }
    }
    parar()
    aplicarTrilho(valorTrilho(largo, recolhida, sobre))
    if (de && rail.current && col.current) {
      animarTrilho(rail.current, col.current, de)
    } else {
      // Atalho, Esc e largura nova: seco, sem o véu esmaecer nem a seta
      // girar. Ler o estilo cria as transições do CSS, que então param.
      getComputedStyle(document.documentElement).opacity
      parar()
    }
  }, [pronto, largo, recolhida, sobre])

  const medirAntes = () => {
    antes.current =
      rail.current && col.current ? medirBorda(rail.current, col.current) : null
  }

  // Trocar de tela fecha a sidebar aberta por cima.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` é o gatilho
  useEffect(() => {
    if (!sobreRef.current) return
    medirAntes()
    setSobre(false)
  }, [pathname])

  const alternar = (porTeclado: boolean) => {
    if (!porTeclado) medirAntes()
    if (largo) {
      const proxima = !recolhida
      setRecolhida(proxima)
      gravarRecolhida(proxima)
      return
    }
    setSobre(!sobre)
  }

  const fechar = () => {
    medirAntes()
    setSobre(false)
    botao.current?.focus()
  }

  const alternarRef = useRef(alternar)
  alternarRef.current = alternar
  const sobreRef = useRef(sobre)
  sobreRef.current = sobre

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sobreRef.current) {
        setSobre(false)
        botao.current?.focus()
        return
      }
      if (!ehAtalhoTrilho(event)) return
      event.preventDefault()
      alternarRef.current(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return {
    rail,
    col,
    botao,
    sobre: sobre && !largo,
    expandida: largo ? !recolhida : sobre,
    alternar,
    fechar
  }
}

type Dica = { rail?: RefObject<HTMLElement | null>; ativa: boolean }

/**
 * O nome de uma peça do trilho, à direita dele. Abre no hover do mouse e no
 * foco do teclado (o Base UI não abre no toque nem no clique), sai da borda
 * do trilho com 10 px de folga qualquer que seja a largura da peça, e fica
 * fora do texto acessível: a peça já tem o rótulo escondido.
 */
function DicaTrilho({
  rail,
  ativa,
  texto,
  render
}: Dica & { texto: string; render: ReactElement }) {
  const alvo = useRef<HTMLButtonElement>(null)
  const folga = () => {
    const borda = rail?.current?.getBoundingClientRect().right
    const peca = alvo.current?.getBoundingClientRect().right
    return borda && peca ? borda - peca + 10 : 10
  }
  return (
    <Tooltip disabled={!ativa}>
      <TooltipTrigger ref={alvo} render={render} />
      <TooltipPortal>
        <TooltipPositioner
          className="pn-dica-pos"
          side="right"
          sideOffset={folga}
        >
          <TooltipPopup className="pn-dica" aria-hidden>
            {texto}
          </TooltipPopup>
        </TooltipPositioner>
      </TooltipPortal>
    </Tooltip>
  )
}

/**
 * Menu do dono: nome e e-mail, tema, plano, landing, feedback e sair. Um
 * painel simples em vez do menu do Radix: a troca de tema é um grupo de
 * rádios, que num `role="menu"` não teria setas nem leitor de tela certos.
 */
function DonoMenu({
  placement,
  onFeedback,
  dica
}: {
  placement: 'up' | 'down'
  onFeedback: (from: HTMLElement | null) => void
  dica?: Dica
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
      <DicaTrilho
        rail={dica?.rail}
        ativa={Boolean(dica?.ativa) && !open && Boolean(name)}
        texto={name}
        render={
          <button
            ref={trigger}
            type="button"
            className="pn-me"
            aria-expanded={open}
            aria-label={name ? `Menu da conta de ${name}` : 'Menu da conta'}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="pn-a">{initials(name)}</span>
            {/* Nome e e-mail cortados com "…": inteiros no topo do menu. */}
            <span className="pn-l" data-polish-inteiro>
              <b>{name || '…'}</b>
              {session?.user?.email}
            </span>
          </button>
        }
      />
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
