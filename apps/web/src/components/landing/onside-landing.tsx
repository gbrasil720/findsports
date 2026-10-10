import { Link, useRouteContext } from '@tanstack/react-router'
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import Add from 'reicon-react/icons/Add'
import ArrowDown from 'reicon-react/icons/ArrowDown'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import ArrowUpRight from 'reicon-react/icons/ArrowUpRight'
import Check from 'reicon-react/icons/Check'
import Menu from 'reicon-react/icons/Menu'
import Pause from 'reicon-react/icons/Pause'
import Play from 'reicon-react/icons/Play'
import Search from 'reicon-react/icons/Search'
import Xmark from 'reicon-react/icons/Xmark'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { CookiePreferencesButton } from '@/components/consent/cookie-consent'
import {
  DEFINITION_POINTS,
  FAQ_ITEMS,
  JOURNEY_STEPS,
  type JourneyStep,
  LANDING_COPY,
  NAV_ITEMS,
  OCCASION_ITEMS,
  PROBLEM_ITEMS,
  TICKER_BENEFITS
} from './onside-landing-content'
import { OnsideFinalStage, OnsideHeroStage } from './onside-scene-stage'

type OnsideChromeProps = {
  /**
   * Prefixo das âncoras da landing: vazio nela mesma, `/` nas páginas que
   * apontam de volta para ela.
   */
  home?: '' | '/'
}

type OnsideHeaderProps = OnsideChromeProps & {
  /**
   * Id da seção escura do topo. Enquanto ela está sob o cabeçalho, ele fica
   * transparente e em cor de papel; depois dela, volta ao normal.
   */
  inkHeroId?: string
}

const HERO_ID = 'top'
const FINAL_ID = 'final'
/**
 * WEB-232: para onde vai o bar que chega pela landing. O cadastro abre com o
 * papel de bar já escolhido.
 */
const BAR_SIGNUP_HREF = '/signup?role=pub'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * WEB-278: com sessão, as chamadas levam ao app em vez do cadastro.
 * Lê a sessão que o `beforeLoad` da raiz já põe no contexto da rota: igual no
 * SSR e na hidratação, sem requisição a mais na página pública. `/app`
 * escolhe o destino pelo papel.
 */
function usePrimaryCta() {
  const hasSession = useRouteContext({
    from: '__root__',
    select: (ctx) => Boolean(ctx.session)
  })
  return hasSession
    ? { hasSession, href: '/app', label: 'Ir para o app' }
    : { hasSession, href: '/signup', label: LANDING_COPY.primaryCta }
}

export function OnsideHeader({ home = '', inkHeroId }: OnsideHeaderProps) {
  const cta = usePrimaryCta()
  const [scrolled, setScrolled] = useState(false)
  // Começa sobre a tinta no servidor e no primeiro render: a página abre no
  // topo, e um valor diferente aqui piscaria o cabeçalho na hidratação.
  const [onInk, setOnInk] = useState(Boolean(inkHeroId))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const previousOverflow = useRef<string | null>(null)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12)
      if (!inkHeroId) return
      const hero = document.getElementById(inkHeroId)
      setOnInk(hero ? window.scrollY <= hero.offsetHeight - 80 : false)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [inkHeroId])

  useEffect(() => {
    if (!menuOpen) return

    previousOverflow.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const frame = requestAnimationFrame(() => {
      firstLinkRef.current?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    const media = window.matchMedia('(min-width: 1101px)')
    const onMedia = () => {
      if (media.matches) setMenuOpen(false)
    }
    media.addEventListener('change', onMedia)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow.current ?? ''
      media.removeEventListener('change', onMedia)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header
      className={`onside-site-header${scrolled ? ' is-scrolled' : ''}${onInk && !menuOpen ? ' is-on-ink' : ''}`}
    >
      <div className="onside-shell onside-nav-wrap">
        <a
          className="onside-brand-link"
          href={`${home}#top`}
          aria-label="Onside — início"
        >
          <OnsideBrand />
        </a>

        <nav className="onside-nav-links" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={`${home}${item.href}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <a className="onside-nav-cta" href={cta.href} data-cta="nav_signup">
          {cta.label}{' '}
          <span className="onside-inline-icon" aria-hidden="true">
            <ArrowUpRight size={16} aria-hidden="true" focusable="false" />
          </span>
        </a>

        <button
          ref={menuButtonRef}
          className="onside-menu-button"
          type="button"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <Xmark size={22} aria-hidden="true" focusable="false" />
          ) : (
            <Menu size={22} aria-hidden="true" focusable="false" />
          )}
        </button>
      </div>

      <div
        id={menuId}
        className={`onside-mobile-menu${menuOpen ? ' is-open' : ''}`}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        onClick={(event) => {
          const target = event.target
          if (target instanceof Element && target.closest('a[href^="#"]')) {
            closeMenu()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            const target = event.target
            if (target instanceof Element && target.closest('a[href^="#"]')) {
              closeMenu()
            }
          }
        }}
      >
        {NAV_ITEMS.map((item, index) => (
          <a
            key={item.id}
            ref={index === 0 ? firstLinkRef : undefined}
            href={`${home}${item.href}`}
          >
            {item.label}
          </a>
        ))}
        <a
          className="onside-button onside-button-acid"
          href={cta.href}
          data-cta="nav_signup"
        >
          {cta.label}
        </a>
      </div>
    </header>
  )
}

/**
 * Botão que acompanha o ponteiro, como no desenho. Só onde há mouse e sem
 * movimento reduzido. O deslocamento vai em variáveis CSS; quem suaviza é a
 * transição do próprio botão.
 */
function useMagnet<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia(REDUCED_MOTION).matches) return

    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect()
      const dx = event.clientX - box.left - box.width / 2
      const dy = event.clientY - box.top - box.height / 2
      element.style.setProperty('--magnet-x', `${dx * 0.22}px`)
      element.style.setProperty('--magnet-y', `${dy * 0.35}px`)
    }
    const leave = () => {
      element.style.removeProperty('--magnet-x')
      element.style.removeProperty('--magnet-y')
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
    }
  }, [])

  return ref
}

/**
 * Chamada principal: cadastro para quem chega, app para quem tem sessão.
 * `place` vira o `data-cta` (`hero_signup`, `final_signup`…).
 */
function PrimaryCta({
  place,
  className
}: {
  place: string
  className: string
}) {
  const cta = usePrimaryCta()
  const ref = useMagnet<HTMLAnchorElement>()
  return (
    <a
      ref={ref}
      className={`onside-magnet ${className}`}
      href={cta.href}
      data-cta={`${place}_signup`}
    >
      {cta.label}
      <span className="onside-inline-icon" aria-hidden="true">
        <ArrowRight size={16} aria-hidden="true" focusable="false" />
      </span>
    </a>
  )
}

/** Rodapé da landing v2 (Claude Design), usado também nas páginas legais. */
export function OnsideFooter({ home = '' }: OnsideChromeProps) {
  const cta = usePrimaryCta()
  const bigmarkRef = useRef<HTMLDivElement>(null)

  // O letreiro sobe quando entra na tela. Só esconde se ainda estiver abaixo
  // da dobra e com o JavaScript de pé: sem ele, fica visível.
  useEffect(() => {
    const element = bigmarkRef.current
    if (!element) return
    if (window.matchMedia(REDUCED_MOTION).matches) return
    if (element.getBoundingClientRect().top < window.innerHeight * 0.95) return

    element.setAttribute('data-reveal', 'pending')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        element.setAttribute('data-reveal', 'in')
        observer.disconnect()
      },
      { rootMargin: '0px 0px -5% 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <footer className="onside-site-footer">
      <div className="onside-shell onside-footer-grid">
        <div className="onside-footer-lead">
          <a
            className="onside-brand-link onside-footer-brand"
            href={`${home}#top`}
            aria-label="Onside — início"
          >
            <OnsideBrand />
          </a>
          <p>Feito por quem prefere a mesa ao sofá.</p>
          <PrimaryCta place="footer" className="onside-footer-cta" />
        </div>

        <nav className="onside-footer-nav" aria-label="Rodapé">
          <div className="onside-footer-column">
            <p>Produto</p>
            {NAV_ITEMS.map((item) => (
              <a key={item.id} href={`${home}${item.href}`}>
                {item.label}
              </a>
            ))}
          </div>
          <div className="onside-footer-column">
            <p>Conta</p>
            {cta.hasSession ? (
              <a href={cta.href}>{cta.label}</a>
            ) : (
              <>
                <Link to="/login">Entrar</Link>
                <Link to="/signup">Criar conta</Link>
              </>
            )}
          </div>
          <div className="onside-footer-column">
            <p>Para bares</p>
            <a href={BAR_SIGNUP_HREF} data-cta="footer_pub_signup">
              Cadastre seu bar
            </a>
            <a href="mailto:contato@onside.sh">Fale com a gente</a>
          </div>
          <div className="onside-footer-column">
            <p>Onside</p>
            <a href="mailto:contato@onside.sh">Contato</a>
            <Link to="/termos">Termos</Link>
            <Link to="/privacidade">Privacidade</Link>
            <CookiePreferencesButton />
          </div>
        </nav>
      </div>

      <div className="onside-shell onside-footer-bar">
        <span>© 2026 Onside</span>
        <span className="onside-footer-status">
          <span aria-hidden="true" />
          {LANDING_COPY.footerStatus}
        </span>
      </div>

      <div
        ref={bigmarkRef}
        className="onside-footer-bigmark"
        aria-hidden="true"
      >
        <div className="onside-shell">Onside</div>
      </div>
    </footer>
  )
}

/**
 * Em que altura da janela (em %) o topo do elemento dispara cada entrada.
 * São os gatilhos de rolagem do protótipo.
 */
const MOTION_START: Record<string, number> = {
  reveal: 86,
  group: 82,
  split: 85,
  tilt: 80,
  compare: 78,
  stamp: 85,
  zoom: 85
}

/**
 * Entradas da página (`data-motion`), todas em CSS: este efeito só marca o
 * que ainda está abaixo da dobra como `pending` e troca para `in` quando o
 * elemento chega. Sem JavaScript, ou com movimento reduzido, nada é
 * escondido.
 */
function useLandingMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia(REDUCED_MOTION).matches) return

    const observers = new Map<number, IntersectionObserver>()
    for (const element of root.querySelectorAll<HTMLElement>('[data-motion]')) {
      const start = MOTION_START[element.dataset.motion ?? ''] ?? 86
      const limit = (window.innerHeight * start) / 100
      if (element.getBoundingClientRect().top < limit) continue

      let observer = observers.get(start)
      if (!observer) {
        observer = new IntersectionObserver(
          (entries, self) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              entry.target.setAttribute('data-motion-state', 'in')
              self.unobserve(entry.target)
            }
          },
          { rootMargin: `0px 0px -${100 - start}% 0px` }
        )
        observers.set(start, observer)
      }
      element.setAttribute('data-motion-state', 'pending')
      observer.observe(element)
    }
    return () => {
      for (const observer of observers.values()) observer.disconnect()
    }
  }, [rootRef])
}

/**
 * A chamada fixa aparece depois do hero e some perto do CTA final, que já
 * traz o mesmo botão.
 */
function useStickyCta() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById(HERO_ID)
      const final = document.getElementById(FINAL_ID)
      const heroHeight = hero ? hero.offsetHeight : window.innerHeight
      const nearEnd = final
        ? window.scrollY + window.innerHeight > final.offsetTop + 120
        : false
      setVisible(window.scrollY > heroHeight * 0.9 && !nearEnd)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return visible
}

/**
 * Palavras em máscaras, para o título subir palavra por palavra
 * (`data-motion="split"`). `from` continua a contagem do trecho anterior.
 */
function words(text: string, from = 0) {
  return text.split(' ').map((word, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
    <Fragment key={index}>
      {index > 0 ? ' ' : null}
      <span className="onside-word">
        <span style={{ '--word': from + index } as CSSProperties}>{word}</span>
      </span>
    </Fragment>
  ))
}

/** Título em duas partes, a segunda em destaque (`<em>`). */
function SplitTitle({ parts }: { parts: readonly [string, string] }) {
  const [lead, accent] = parts
  return (
    <>
      {words(lead)} <em>{words(accent, lead.split(' ').length)}</em>
    </>
  )
}

function ProofList({
  items,
  className
}: {
  items: readonly string[]
  className: string
}) {
  return (
    <div className={`onside-proof ${className}`}>
      {items.map((item) => (
        <span key={item}>
          <span className="onside-inline-icon" aria-hidden="true">
            <Check size={12} aria-hidden="true" focusable="false" />
          </span>
          {item}
        </span>
      ))}
    </div>
  )
}

function OnsideTicker() {
  const [isPaused, setIsPaused] = useState(false)

  return (
    <section
      className={`onside-ticker${isPaused ? ' is-paused' : ''}`}
      aria-label="Benefícios da Onside"
    >
      <button
        className="onside-ticker-control"
        type="button"
        aria-pressed={isPaused}
        aria-label={
          isPaused ? 'Retomar animação do ticker' : 'Pausar animação do ticker'
        }
        onClick={() => setIsPaused((current) => !current)}
      >
        {isPaused ? (
          <Play size={14} aria-hidden="true" focusable="false" />
        ) : (
          <Pause size={14} aria-hidden="true" focusable="false" />
        )}
        {isPaused ? 'Retomar' : 'Pausar'}
      </button>
      <div className="onside-ticker-track">
        {[false, true].flatMap((copy) =>
          TICKER_BENEFITS.map((text) => (
            <span key={`${copy}-${text}`} aria-hidden={copy || undefined}>
              {text}
            </span>
          ))
        )}
      </div>
    </section>
  )
}

/**
 * Passo 01: alguém digita o jogo na busca. Meio segundo depois de entrar na
 * tela, uma letra a cada 70 ms, como no protótipo.
 */
function TypedSearch() {
  const ref = useRef<HTMLElement>(null)
  const [typed, setTyped] = useState<string | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia(REDUCED_MOTION).matches) return

    const text = LANDING_COPY.journey.searchTyped
    let timer = 0
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        let length = 0
        const type = () => {
          setTyped(text.slice(0, length))
          if (length++ < text.length) timer = window.setTimeout(type, 70)
        }
        timer = window.setTimeout(type, 500)
      },
      { rootMargin: '0px 0px -20% 0px' }
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <strong ref={ref} className={typed === null ? undefined : 'is-typed'}>
      {typed ?? LANDING_COPY.journey.searchPlaceholder}
      {typed === null ? null : <i />}
    </strong>
  )
}

function JourneyVisual({ variant }: { variant: JourneyStep['variant'] }) {
  if (variant === 'search') {
    return (
      <div className="onside-journey-visual" aria-hidden="true">
        <div className="onside-mini-search">
          <span className="onside-inline-icon">
            <Search size={16} aria-hidden="true" focusable="false" />
          </span>
          <TypedSearch />
        </div>
        <div className="onside-sport-options">
          <span>Futebol</span>
          <span>Basquete</span>
          <span>F1</span>
          <span>UFC</span>
        </div>
      </div>
    )
  }

  if (variant === 'compare') {
    return (
      <div
        className="onside-journey-visual onside-compare-visual"
        data-motion="compare"
        aria-hidden="true"
      >
        <div className="onside-compare-row">
          <strong>Bar do Zé</strong>
          <span>1,2 km</span>
          <small>3 telões · preço médio $$</small>
        </div>
        <div className="onside-compare-row">
          <strong>Sports Central</strong>
          <span>2,4 km</span>
          <small>3 telões · ambiente esportivo</small>
        </div>
        <div className="onside-compare-row">
          <strong>The Red Lion</strong>
          <span>3,1 km</span>
          <small>Torcida rubro-negra</small>
        </div>
      </div>
    )
  }

  return (
    <div
      className="onside-journey-visual onside-arrival-visual"
      aria-hidden="true"
    >
      <div className="onside-arrival-card">
        <small>BAR DO ZÉ · PINHEIROS</small>
        <strong>
          Grade atualizada
          <br />
          antes de você sair.
        </strong>
        <div>
          <span>Atualizada</span>
          <span>há 18 min</span>
          <span data-motion="stamp">Confirmada</span>
        </div>
      </div>
    </div>
  )
}

function SectionKicker({ children }: { children: ReactNode }) {
  return <p className="onside-section-kicker">{children}</p>
}

export function OnsideLanding() {
  const pageRef = useRef<HTMLDivElement>(null)
  const sticky = useStickyCta()
  useLandingMotion(pageRef)

  const [heroLead, heroAccent, heroTail] = LANDING_COPY.hero.title
  const [finalLead, finalAccent] = LANDING_COPY.final.title

  return (
    <div ref={pageRef} className="onside-page onside-landing">
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader inkHeroId={HERO_ID} />

      <main id="main">
        <section className="onside-hero" id={HERO_ID}>
          <OnsideHeroStage />
          <div className="onside-shell onside-hero-content">
            <div className="onside-hero-copy">
              <div className="onside-eyebrow">
                <span className="onside-live-dot" aria-hidden="true" />
                {LANDING_COPY.hero.eyebrow}
              </div>
              <h1>
                {heroLead} <em>{heroAccent}</em> {heroTail}
              </h1>
              <p>{LANDING_COPY.hero.body}</p>
              <div className="onside-hero-actions">
                <PrimaryCta
                  place="hero"
                  className="onside-button onside-button-acid onside-button-lg"
                />
                <a
                  className="onside-button onside-button-ghost onside-button-lg"
                  href="#como-funciona"
                >
                  {LANDING_COPY.hero.secondaryCta}
                  <span className="onside-inline-icon" aria-hidden="true">
                    <ArrowDown size={16} aria-hidden="true" focusable="false" />
                  </span>
                </a>
              </div>
              <ProofList
                className="onside-hero-proof"
                items={LANDING_COPY.proof}
              />
            </div>
            <p className="onside-hero-hint" aria-hidden="true">
              {LANDING_COPY.hero.hint}
            </p>
          </div>
        </section>

        <OnsideTicker />

        <section className="onside-problem onside-section-pad" id="produto">
          <div className="onside-shell">
            <div className="onside-split-intro" data-motion="reveal">
              <SectionKicker>{LANDING_COPY.problem.kicker}</SectionKicker>
              <h2 data-motion="split">{words(LANDING_COPY.problem.title)}</h2>
            </div>
            <div className="onside-problem-cards" data-motion="tilt">
              {PROBLEM_ITEMS.map((item) => (
                <article key={item.id}>
                  <span>{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-definition onside-section-pad">
          <div className="onside-shell onside-definition-grid">
            <div data-motion="reveal">
              <SectionKicker>{LANDING_COPY.solution.kicker}</SectionKicker>
              <h2 data-motion="split">{words(LANDING_COPY.solution.title)}</h2>
            </div>
            <div className="onside-definition-copy" data-motion="reveal">
              <p className="onside-big-copy">{LANDING_COPY.solution.body}</p>
              <div className="onside-definition-points">
                {DEFINITION_POINTS.map((point) => (
                  <div key={point.id}>
                    <span>{point.number}</span>
                    <p>{point.text}</p>
                  </div>
                ))}
              </div>
              <p className="onside-definition-closing">
                {LANDING_COPY.solution.closing}
              </p>
            </div>
          </div>
        </section>

        <section
          className="onside-journey-section onside-section-pad"
          id="como-funciona"
        >
          <div className="onside-shell">
            <div className="onside-centered-intro" data-motion="reveal">
              <SectionKicker>{LANDING_COPY.journey.kicker}</SectionKicker>
              <h2 data-motion="split">{words(LANDING_COPY.journey.title)}</h2>
            </div>
            <div className="onside-journey" data-motion="group">
              {JOURNEY_STEPS.map((step) => (
                <article key={step.id}>
                  <JourneyVisual variant={step.variant} />
                  <div className="onside-journey-copy">
                    <span>{step.number}</span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-occasions onside-section-pad">
          <div className="onside-shell onside-occasions-grid">
            <div data-motion="reveal">
              <SectionKicker>{LANDING_COPY.variety.kicker}</SectionKicker>
              <h2 data-motion="split">{words(LANDING_COPY.variety.title)}</h2>
              <p>{LANDING_COPY.variety.body}</p>
            </div>
            <div className="onside-occasion-list" data-motion="group">
              {OCCASION_ITEMS.map((item) => (
                <div key={item.id}>
                  <strong>{item.number}</strong>
                  <span>{item.title}</span>
                  <small className={item.highlight ? 'is-acid' : undefined}>
                    {item.tag}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-community">
          <picture>
            <source srcSet="/hero-bar.webp" type="image/webp" />
            <img
              className="onside-community-photo"
              src="/hero-bar.jpg"
              alt="Torcedores assistindo a uma partida em um bar com vários telões"
              width={1280}
              height={1024}
              loading="lazy"
              decoding="async"
            />
          </picture>
          <div className="onside-community-overlay" aria-hidden="true" />
          <div
            className="onside-shell onside-community-content"
            data-motion="reveal"
          >
            <SectionKicker>{LANDING_COPY.community.kicker}</SectionKicker>
            <h2 data-motion="split">
              <SplitTitle parts={LANDING_COPY.community.title} />
            </h2>
            <p>{LANDING_COPY.community.body}</p>
            <PrimaryCta
              place="community"
              className="onside-button onside-button-acid"
            />
          </div>
        </section>

        <section className="onside-story onside-section-pad" id="historia">
          <div className="onside-shell onside-story-grid">
            <div className="onside-story-copy" data-motion="reveal">
              <SectionKicker>{LANDING_COPY.story.kicker}</SectionKicker>
              <h2 data-motion="split">
                <SplitTitle parts={LANDING_COPY.story.title} />
              </h2>
              <p>{LANDING_COPY.story.body}</p>
              <p>{LANDING_COPY.story.closing}</p>
              <PrimaryCta
                place="story"
                className="onside-button onside-button-ink"
              />
            </div>
            <div className="onside-story-mark" aria-hidden="true">
              {/* biome-ignore lint/performance/noImgElement: marca estática de `public/` */}
              <img
                src="/onside-icone-preto.png"
                alt=""
                width={360}
                height={360}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section className="onside-faq onside-section-pad" id="duvidas">
          <div className="onside-shell onside-faq-grid">
            <div data-motion="reveal">
              <SectionKicker>{LANDING_COPY.faq.kicker}</SectionKicker>
              <h2>
                {LANDING_COPY.faq.title[0]}
                <br />
                <em>{LANDING_COPY.faq.title[1]}</em>
              </h2>
            </div>
            <div className="onside-faq-list" data-motion="reveal">
              {FAQ_ITEMS.map((item, index) => (
                <details key={item.id} open={index === 0 || undefined}>
                  <summary>
                    {item.question}
                    <span className="onside-faq-icon" aria-hidden="true">
                      <Add size={18} aria-hidden="true" focusable="false" />
                    </span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-final-cta" id={FINAL_ID}>
          <OnsideFinalStage />
          <div
            className="onside-shell onside-final-cta-inner"
            data-motion="reveal"
          >
            <p>{LANDING_COPY.final.kicker}</p>
            <h2>
              {finalLead} <em>{finalAccent}</em>
            </h2>
            <div className="onside-hero-actions">
              <PrimaryCta
                place="final"
                className="onside-button onside-button-acid onside-button-lg"
              />
              <a
                className="onside-button onside-button-ghost onside-button-lg"
                href="#como-funciona"
              >
                {LANDING_COPY.hero.secondaryCta}
              </a>
            </div>
            <ProofList
              className="onside-final-proof"
              items={LANDING_COPY.final.proof}
            />
          </div>
        </section>
      </main>

      <OnsideFooter />

      <div
        className={`onside-sticky-cta${sticky ? ' is-visible' : ''}`}
        aria-hidden={!sticky}
        inert={!sticky}
      >
        <span>{LANDING_COPY.sticky}</span>
        <PrimaryCta place="sticky" className="onside-sticky-button" />
      </div>
    </div>
  )
}
