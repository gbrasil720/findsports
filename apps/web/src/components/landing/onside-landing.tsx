import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import Add from 'reicon-react/icons/Add'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import ArrowUpRight from 'reicon-react/icons/ArrowUpRight'
import Check from 'reicon-react/icons/Check'
import ChevronDown from 'reicon-react/icons/ChevronDown'
import Menu from 'reicon-react/icons/Menu'
import Pause from 'reicon-react/icons/Pause'
import Play from 'reicon-react/icons/Play'
import Search from 'reicon-react/icons/Search'
import Xmark from 'reicon-react/icons/Xmark'
import { OnsideBrand, OnsideMark } from '@/components/brand/onside-brand'
import { HIGHLIGHTS_QUERY } from '@/lib/query-cache'
import { useTRPC } from '../../utils/trpc'
import { OnsideAppDemo } from './onside-app-demo'
import {
  DEFINITION_POINTS,
  FAQ_ITEMS,
  JOURNEY_STEPS,
  type JourneyStep,
  LANDING_COPY,
  NAV_ITEMS,
  PROBLEM_ITEMS,
  TICKER_BENEFITS,
  type TickerLiveItem
} from './onside-landing-content'
import { OnsideFanWaitlistForm } from './onside-waitlist'

function OnsideHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const previousOverflow = useRef<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
    <header className={`onside-site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="onside-shell onside-nav-wrap">
        <a
          className="onside-brand-link"
          href="#top"
          aria-label="Onside — início"
        >
          <OnsideBrand />
        </a>

        <nav className="onside-nav-links" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <a
          className="onside-nav-cta"
          href="#lista"
          data-cta="nav_city_waitlist"
        >
          {LANDING_COPY.primaryCta}{' '}
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

      {menuOpen ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: closes menu when any hash link inside is activated
        <div
          id={menuId}
          className="onside-mobile-menu is-open"
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
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          <a
            className="onside-button onside-button-acid"
            href="#lista"
            data-cta="nav_city_waitlist"
          >
            {LANDING_COPY.primaryCta}
          </a>
        </div>
      ) : null}
    </header>
  )
}

function startOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function relativeDayLabel(startsAt: Date, now = new Date()) {
  const timeZone = 'America/Sao_Paulo'
  const eventDay = startOfDayInTimeZone(startsAt, timeZone)
  const today = startOfDayInTimeZone(now, timeZone)

  if (eventDay === today) return 'HOJE'

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrow = startOfDayInTimeZone(tomorrowDate, timeZone)
  if (eventDay === tomorrow) return 'AMANHÃ'

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'short'
  })
    .format(startsAt)
    .replace('.', '')
    .toUpperCase()
}

function formatTickerEvent(event: {
  bar_name?: unknown
  championship?: unknown
  starts_at?: unknown
  sport_name?: unknown
  neighborhood?: unknown
  city?: unknown
}): TickerLiveItem {
  const startsAtRaw = event.starts_at
  const startsAt = new Date(String(startsAtRaw ?? ''))
  const valid = !Number.isNaN(startsAt.getTime())

  const time = valid
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(startsAt)
    : '--:--'

  const dayLabel = valid ? relativeDayLabel(startsAt) : 'EM BREVE'
  const championship = String(
    event.championship ?? event.sport_name ?? 'Partida'
  )
    .trim()
    .toUpperCase()
  const place = String(
    event.neighborhood || event.city || event.bar_name || 'Bar'
  )
    .trim()
    .toUpperCase()

  return {
    id: `${String(event.bar_name)}-${String(startsAtRaw)}-${championship}`,
    timeLabel: `${dayLabel} ${time}`,
    event: championship,
    place
  }
}

function OnsideTicker() {
  const trpc = useTRPC()
  const [isPaused, setIsPaused] = useState(false)
  const session = useRouteContext({
    from: '__root__',
    select: (ctx) => ctx.session
  })
  const { data: eliteEvents = [] } = useQuery({
    ...trpc.pubs.getEliteEvents.queryOptions(),
    ...HIGHLIGHTS_QUERY,
    enabled: !!session
  })

  const hasLiveEvents = eliteEvents.length > 0
  const liveItems = hasLiveEvents
    ? eliteEvents.map((event) =>
        formatTickerEvent(event as Record<string, unknown>)
      )
    : []

  const liveLoop = [0, 1].flatMap((copy) =>
    liveItems.map((item) => ({
      ...item,
      key: `${copy}-${item.id}`
    }))
  )

  const benefitLoop = [0, 1].flatMap((copy) =>
    TICKER_BENEFITS.map((item) => ({
      ...item,
      key: `${copy}-${item.id}`
    }))
  )

  return (
    <section
      className={`onside-schedule-strip${isPaused ? ' is-paused' : ''}${hasLiveEvents ? '' : ' is-benefits'}`}
      aria-label={
        hasLiveEvents ? 'Agenda confirmada pelos bares' : 'Benefícios da Onside'
      }
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
      {hasLiveEvents ? (
        <div className="onside-schedule-track">
          {liveLoop.map((item) => (
            <span key={item.key}>
              <b>{item.timeLabel}</b> {item.event} · {item.place}
            </span>
          ))}
        </div>
      ) : (
        <div className="onside-schedule-track">
          {benefitLoop.map((item) => (
            <span key={item.key}>
              <b>{item.text}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function JourneyVisual({ variant }: { variant: JourneyStep['variant'] }) {
  if (variant === 'search') {
    return (
      <div
        className="onside-journey-visual onside-search-visual"
        aria-hidden="true"
      >
        <div className="onside-mini-search">
          <span className="onside-inline-icon">
            <Search size={16} aria-hidden="true" focusable="false" />
          </span>
          <strong>Qual jogo você quer ver?</strong>
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
          <span>Confirmada</span>
        </div>
      </div>
    </div>
  )
}

function FanDashboardMock() {
  return (
    <div className="onside-dashboard-mock" aria-hidden="true">
      <p className="onside-dashboard-preview-label">
        Prévia do dashboard · ainda não disponível
      </p>
      <div className="onside-dash-header">
        <div className="onside-dash-brand">
          <OnsideMark className="onside-dash-symbol" size={17} />
          <b>ONSIDE</b>
        </div>
        <span className="onside-dash-select">
          São Paulo{' '}
          <span className="onside-inline-icon">
            <ChevronDown size={12} aria-hidden="true" focusable="false" />
          </span>
        </span>
      </div>
      <div className="onside-dash-body">
        <aside>
          <b>Hoje</b>
          <span>Mapa</span>
          <span>Favoritos</span>
          <span>Perfil</span>
        </aside>
        <div className="onside-dash-main">
          <div className="onside-dash-title">
            <div>
              <small>BARES PERTO DE VOCÊ</small>
              <h3>Onde você assiste hoje?</h3>
            </div>
            <span className="onside-dash-add">
              <span className="onside-inline-icon">
                <Add size={12} aria-hidden="true" focusable="false" />
              </span>{' '}
              Usar localização
            </span>
          </div>
          <div className="onside-dash-stats">
            <div>
              <small>ESPORTE</small>
              <strong>Futebol</strong>
              <span>Selecionado</span>
            </div>
            <div>
              <small>DISTÂNCIA</small>
              <strong>5 km</strong>
              <span>Raio da busca</span>
            </div>
            <div>
              <small>PREÇO MÉDIO</small>
              <strong>$$</strong>
              <span>No lançamento</span>
            </div>
          </div>
          <div className="onside-dash-list">
            <div>
              <span className="onside-day">
                1,2
                <br />
                <b>KM</b>
              </span>
              <span className="onside-game">
                <b>Bar Exemplo</b>
                <small>3 telões · som no jogo · $$</small>
              </span>
              <span className="onside-published">EXEMPLO</span>
            </div>
            <div>
              <span className="onside-day">
                2,4
                <br />
                <b>KM</b>
              </span>
              <span className="onside-game">
                <b>Espaço Central</b>
                <small>Ambiente esportivo · preço médio $</small>
              </span>
              <span className="onside-published">EXEMPLO</span>
            </div>
            <div>
              <span className="onside-day">
                3,1
                <br />
                <b>KM</b>
              </span>
              <span className="onside-game">
                <b>Casa da Torcida</b>
                <small>Telão · comida · preço médio $$</small>
              </span>
              <span className="onside-draft">EXEMPLO</span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className={className}>
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

export function OnsideLanding() {
  const primaryHref = '#lista'
  const primaryLabel = LANDING_COPY.primaryCta

  return (
    <div className="onside-page">
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader />

      <main id="main">
        <section className="onside-hero" id="top">
          <div className="onside-shell onside-hero-grid">
            <div className="onside-hero-copy">
              <div className="onside-eyebrow">
                <span className="onside-live-dot" aria-hidden="true" />
                {LANDING_COPY.hero.eyebrow}
              </div>
              <h1>{LANDING_COPY.hero.title}</h1>
              <p>{LANDING_COPY.hero.body}</p>
              <div className="onside-hero-actions">
                <a
                  className="onside-button onside-button-acid"
                  href={primaryHref}
                  data-cta="hero_city_waitlist"
                >
                  {primaryLabel}{' '}
                  <span className="onside-inline-icon" aria-hidden="true">
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      focusable="false"
                    />
                  </span>
                </a>
              </div>
              <ProofList
                className="onside-hero-proof"
                items={[
                  'Grátis para torcedores',
                  'Sem newsletter',
                  'Aviso no lançamento'
                ]}
              />
              <p className="onside-hero-note">{LANDING_COPY.hero.note}</p>
            </div>
            <OnsideAppDemo />
          </div>
        </section>

        <OnsideTicker />

        <section className="onside-problem onside-section-pad" id="produto">
          <div className="onside-shell">
            <div className="onside-section-intro onside-split-intro">
              <p className="onside-section-kicker">
                {LANDING_COPY.problem.kicker}
              </p>
              <h2>{LANDING_COPY.problem.title}</h2>
            </div>
            <div className="onside-problem-rows">
              {PROBLEM_ITEMS.map((item) => (
                <article key={item.id}>
                  <span className="onside-row-number">{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-definition onside-section-pad onside-dark-section">
          <div className="onside-shell onside-definition-grid">
            <div>
              <p className="onside-section-kicker onside-acid-text">
                {LANDING_COPY.solution.kicker}
              </p>
              <h2>{LANDING_COPY.solution.title}</h2>
            </div>
            <div className="onside-definition-copy">
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
          className="onside-experience onside-section-pad"
          id="como-funciona"
        >
          <div className="onside-shell">
            <div className="onside-section-intro onside-centered-intro">
              <p className="onside-section-kicker">
                {LANDING_COPY.journey.kicker}
              </p>
              <h2>{LANDING_COPY.journey.title}</h2>
            </div>
            <div className="onside-journey">
              {JOURNEY_STEPS.map((step) => (
                <article
                  key={step.id}
                  className={`onside-journey-step${step.reverse ? ' is-reverse' : ''}`}
                >
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

        <section className="onside-trust onside-section-pad">
          <div className="onside-shell onside-trust-grid">
            <div>
              <p className="onside-section-kicker">
                {LANDING_COPY.variety.kicker}
              </p>
              <h2>{LANDING_COPY.variety.title}</h2>
            </div>
            <div className="onside-trust-list">
              <div>
                <strong>01</strong>
                <h3>Barato, animado ou mais tranquilo.</h3>
                <p>{LANDING_COPY.variety.body}</p>
              </div>
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
          <div className="onside-shell onside-community-content">
            <p className="onside-section-kicker">
              {LANDING_COPY.community.kicker}
            </p>
            <h2>{LANDING_COPY.community.title}</h2>
            <p>{LANDING_COPY.community.body}</p>
            <a
              className="onside-button onside-button-acid"
              href={primaryHref}
              data-cta="community_city_waitlist"
            >
              {primaryLabel}{' '}
              <span className="onside-inline-icon" aria-hidden="true">
                <ArrowRight size={16} aria-hidden="true" focusable="false" />
              </span>
            </a>
          </div>
        </section>

        <section className="onside-waitlist onside-section-pad" id="lista">
          <div className="onside-shell onside-waitlist-grid">
            <div className="onside-waitlist-copy">
              <p className="onside-section-kicker onside-acid-text">
                {LANDING_COPY.waitlist.kicker}
              </p>
              <h2>{LANDING_COPY.waitlist.title}</h2>
              <p>{LANDING_COPY.waitlist.body}</p>
              <ProofList
                className="onside-waitlist-facts"
                items={[
                  'Grátis para torcedores',
                  'Sem newsletter',
                  'Aviso no lançamento'
                ]}
              />
            </div>
            <OnsideFanWaitlistForm />
          </div>
        </section>

        <section className="onside-bars onside-section-pad" id="historia">
          <div className="onside-shell onside-bars-grid">
            <div className="onside-bars-copy">
              <p className="onside-section-kicker">
                {LANDING_COPY.story.kicker}
              </p>
              <h2>{LANDING_COPY.story.title}</h2>
              <p>{LANDING_COPY.story.body}</p>
              <p>{LANDING_COPY.story.closing}</p>
              <a
                className="onside-button onside-button-ink"
                href={primaryHref}
                data-cta="story_city_waitlist"
              >
                {primaryLabel}{' '}
                <span className="onside-inline-icon" aria-hidden="true">
                  <ArrowRight size={16} aria-hidden="true" focusable="false" />
                </span>
              </a>
            </div>
            <FanDashboardMock />
          </div>
        </section>

        <section className="onside-faq onside-section-pad" id="duvidas">
          <div className="onside-shell onside-faq-grid">
            <div>
              <p className="onside-section-kicker">DÚVIDAS ANTES DO CADASTRO</p>
              <h2>
                O QUE VOCÊ PRECISA
                <br />
                <em>SABER ANTES DE SE CADASTRAR.</em>
              </h2>
            </div>
            <div className="onside-faq-list">
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

        <section className="onside-final-cta">
          <div className="onside-shell onside-final-cta-inner">
            <OnsideMark className="onside-final-symbol" size={72} />
            <p>ONSIDE · {LANDING_COPY.final.kicker}</p>
            <h2>{LANDING_COPY.final.title}</h2>
            <a
              className="onside-button onside-button-ink"
              href={primaryHref}
              data-cta="final_city_waitlist"
            >
              {primaryLabel}{' '}
              <span className="onside-inline-icon" aria-hidden="true">
                <ArrowRight size={16} aria-hidden="true" focusable="false" />
              </span>
            </a>
            <ProofList
              className="onside-final-proof"
              items={['Grátis', 'Sem newsletter', 'Aviso no lançamento']}
            />
          </div>
        </section>
      </main>

      <footer className="onside-site-footer">
        <div className="onside-shell onside-footer-grid">
          <a
            className="onside-brand-link onside-footer-brand"
            href="#top"
            aria-label="Onside — início"
          >
            <OnsideBrand />
          </a>
          <p>Feito por quem prefere a mesa ao sofá.</p>
          <div className="onside-footer-links">
            <a href="#lista">Waitlist</a>
            <a href="#duvidas">Dúvidas</a>
            <a href="mailto:contato@onside.sh">Contato</a>
          </div>
          <small>© 2026 Onside</small>
        </div>
      </footer>
    </div>
  )
}
