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
  BAR_BENEFITS,
  DEFINITION_POINTS,
  FAQ_ITEMS,
  JOURNEY_STEPS,
  type JourneyStep,
  NAV_ITEMS,
  PROBLEM_ITEMS,
  TICKER_BENEFITS,
  type TickerLiveItem,
  TRUST_ITEMS
} from './onside-landing-content'
import { OnsideBarInterestForm, OnsideFanWaitlistForm } from './onside-waitlist'

function OnsideHeader({ publicSignup }: { publicSignup: boolean }) {
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
          href={publicSignup ? '/signup' : '#lista'}
          data-cta="nav_city_waitlist"
        >
          {publicSignup ? 'Criar conta' : 'Levar a Onside à minha cidade'}{' '}
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
            href={publicSignup ? '/signup' : '#lista'}
            data-cta="nav_city_waitlist"
          >
            {publicSignup ? 'Criar conta' : 'Levar a Onside à minha cidade'}
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
          <small>80% cheio · som no jogo</small>
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

function BarsDashboardMock() {
  return (
    <div className="onside-dashboard-mock" aria-hidden="true">
      <p className="onside-dashboard-preview-label">
        Prévia do painel · ainda não disponível
      </p>
      <div className="onside-dash-header">
        <div className="onside-dash-brand">
          <OnsideMark className="onside-dash-symbol" size={17} />
          <b>ONSIDE PARA BARES</b>
        </div>
        <span className="onside-dash-select">
          Bar do Zé{' '}
          <span className="onside-inline-icon">
            <ChevronDown size={12} aria-hidden="true" focusable="false" />
          </span>
        </span>
      </div>
      <div className="onside-dash-body">
        <aside>
          <b>Visão geral</b>
          <span>Minha grade</span>
          <span>Meu espaço</span>
          <span>Configurações</span>
        </aside>
        <div className="onside-dash-main">
          <div className="onside-dash-title">
            <div>
              <small>SEMANA DE EXEMPLO</small>
              <h3>Sua grade</h3>
            </div>
            <span className="onside-dash-add">
              <span className="onside-inline-icon">
                <Add size={12} aria-hidden="true" focusable="false" />
              </span>{' '}
              Adicionar transmissão
            </span>
          </div>
          <div className="onside-dash-stats">
            <div>
              <small>TRANSMISSÕES</small>
              <strong>—</strong>
              <span>No piloto</span>
            </div>
            <div>
              <small>ATUALIZAÇÕES</small>
              <strong>—</strong>
              <span>No piloto</span>
            </div>
            <div>
              <small>COBERTURA</small>
              <strong>—</strong>
              <span>No piloto</span>
            </div>
          </div>
          <div className="onside-dash-list">
            <div>
              <span className="onside-day">
                HOJE
                <br />
                <b>04</b>
              </span>
              <span className="onside-game">
                <b>Flamengo x Palmeiras</b>
                <small>Brasileirão · 21:30</small>
              </span>
              <span className="onside-published">PUBLICADO</span>
            </div>
            <div>
              <span className="onside-day">
                QUI
                <br />
                <b>06</b>
              </span>
              <span className="onside-game">
                <b>NBA Finals · Jogo 4</b>
                <small>Basquete · 22:00</small>
              </span>
              <span className="onside-published">PUBLICADO</span>
            </div>
            <div>
              <span className="onside-day">
                SÁB
                <br />
                <b>08</b>
              </span>
              <span className="onside-game">
                <b>UFC · Card principal</b>
                <small>Luta · 23:00</small>
              </span>
              <span className="onside-draft">RASCUNHO</span>
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
  const trpc = useTRPC()
  const configQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const publicSignup =
    configQuery.data?.['launch.waitlist_gate']?.signup === false
  const primaryHref = publicSignup ? '/signup' : '#lista'
  const primaryLabel = publicSignup
    ? 'Criar conta'
    : 'Levar a Onside à minha cidade'

  return (
    <div className="onside-page">
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader publicSignup={publicSignup} />

      <main id="main">
        <section className="onside-hero" id="top">
          <div className="onside-shell onside-hero-grid">
            <div className="onside-hero-copy">
              <div className="onside-eyebrow">
                <span className="onside-live-dot" aria-hidden="true" />A ONSIDE
                ESTÁ CHEGANDO
              </div>
              <h1>
                SAIBA ONDE SEU JOGO
                <br />
                VAI PASSAR.{' '}
                <em>
                  ANTES
                  <br />
                  DE SAIR DE CASA.
                </em>
              </h1>
              <p>
                A Onside vai reunir bares que confirmaram a transmissão e
                mostrar distância, lotação, som, telões e perfil da torcida.
                Cadastre sua cidade para ajudar a definir o primeiro lançamento.
              </p>
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
                <a
                  className="onside-text-link"
                  href="#bares"
                  data-cta="hero_bar_interest"
                >
                  Quero participar com meu bar{' '}
                  <span className="onside-inline-icon" aria-hidden="true">
                    <ArrowUpRight
                      size={14}
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
                  'Confirmação e convite por e-mail'
                ]}
              />
            </div>
            <OnsideAppDemo />
          </div>
        </section>

        <OnsideTicker />

        <section className="onside-problem onside-section-pad" id="produto">
          <div className="onside-shell">
            <div className="onside-section-intro onside-split-intro">
              <p className="onside-section-kicker">O PROBLEMA</p>
              <h2>
                O BAR APARECE NA BUSCA.
                <br />
                <em>A GRADE DO SEU JOGO, NÃO.</em>
              </h2>
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
                A PROPOSTA
              </p>
              <h2>
                A GRADE ESPORTIVA
                <br />
                DOS BARES, JOGO POR JOGO.
              </h2>
            </div>
            <div className="onside-definition-copy">
              <p className="onside-big-copy">
                A Onside pretende reunir a programação publicada pelas casas e
                as confirmações de quem já está no local. Assim, você compara
                onde assistir sem depender de mais um story ou de uma ligação.
              </p>
              <div className="onside-definition-points">
                {DEFINITION_POINTS.map((point) => (
                  <div key={point.id}>
                    <span>{point.number}</span>
                    <p>{point.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="onside-experience onside-section-pad"
          id="como-funciona"
        >
          <div className="onside-shell">
            <div className="onside-section-intro onside-centered-intro">
              <p className="onside-section-kicker">DO JOGO AO BAR</p>
              <h2>
                TRÊS PASSOS PARA
                <br />
                <em>ESCOLHER ANTES DE SAIR.</em>
              </h2>
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
              <p className="onside-section-kicker">INFORMAÇÃO COM ORIGEM</p>
              <h2>
                CONFIRMADO APARECE COMO CONFIRMADO.
                <br />
                <em>O RESTO APARECE COMO DÚVIDA.</em>
              </h2>
            </div>
            <div className="onside-trust-list">
              {TRUST_ITEMS.map((item) => (
                <div key={item.id}>
                  <strong>{item.number}</strong>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="onside-community">
          <picture>
            <source srcSet="/hero-bar.webp" type="image/webp" />
            {/* biome-ignore lint/performance/noImgElement: landing uses static public asset without Next image pipeline */}
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
            <p className="onside-section-kicker">O JOGO É AQUI</p>
            <h2>
              O GOL É O MESMO.
              <br />
              <em>ASSISTIR JUNTO É OUTRA COISA.</em>
            </h2>
            <p>
              A Onside quer ajudar você a encontrar o bar e a torcida que fazem
              aquela partida valer a saída de casa.
            </p>
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
                {publicSignup
                  ? 'A ONSIDE ESTÁ ABERTA'
                  : 'AJUDE A ONSIDE A CHEGAR'}
              </p>
              <h2>
                {publicSignup ? 'ENTRE EM CAMPO' : 'LEVE A ONSIDE'}
                <br />
                {publicSignup ? (
                  <em>AGORA.</em>
                ) : (
                  <>
                    À SUA <em>CIDADE.</em>
                  </>
                )}
              </h2>
              <p>
                {publicSignup
                  ? 'Crie sua conta para encontrar onde assistir e participar da comunidade Onside.'
                  : 'As primeiras cidades serão escolhidas pela demanda de torcedores e pela adesão de bares. Confirme seu cadastro para entrar na waitlist.'}
              </p>
              <ProofList
                className="onside-waitlist-facts"
                items={[
                  'Grátis para torcedores',
                  'Sem newsletter',
                  'Controle pelo próprio e-mail'
                ]}
              />
            </div>
            {publicSignup ? (
              <a className="onside-button onside-button-acid" href="/signup">
                Criar conta
              </a>
            ) : (
              <OnsideFanWaitlistForm />
            )}
          </div>
        </section>

        <section className="onside-bars onside-section-pad" id="bares">
          <div className="onside-shell onside-bars-grid">
            <div className="onside-bars-copy">
              <p className="onside-section-kicker">PARA BARES E PUBS</p>
              <h2>
                PUBLIQUE SUA GRADE E APAREÇA PARA QUEM JÁ PROCURA{' '}
                <em>AQUELE JOGO.</em>
              </h2>
              <p>
                No piloto, o bar informa as transmissões da semana e detalhes
                como som, telões e lotação. A Onside organiza essa informação
                para o torcedor encontrar a casa pelo jogo e pela localização.
              </p>
              <div className="onside-bars-benefits">
                {BAR_BENEFITS.map((benefit) => (
                  <span key={benefit}>
                    <span className="onside-inline-icon" aria-hidden="true">
                      <ArrowUpRight
                        size={14}
                        aria-hidden="true"
                        focusable="false"
                      />
                    </span>
                    {benefit}
                  </span>
                ))}
              </div>
              <a
                className="onside-button onside-button-ink"
                href={publicSignup ? '/signup' : '#bar-form'}
                data-cta="bars_register_interest"
              >
                {publicSignup
                  ? 'Criar conta do bar'
                  : 'Quero participar do piloto'}{' '}
                <span className="onside-inline-icon" aria-hidden="true">
                  <ArrowUpRight
                    size={16}
                    aria-hidden="true"
                    focusable="false"
                  />
                </span>
              </a>
            </div>
            <BarsDashboardMock />
          </div>
        </section>

        <section className="onside-bar-mini-form" id="bar-form">
          <div className="onside-shell onside-bar-form-inner">
            <div>
              <p className="onside-section-kicker">VOCÊ TEM UM BAR?</p>
              <h2>CONTE SOBRE SEU BAR.</h2>
            </div>
            {publicSignup ? (
              <a className="onside-button onside-button-acid" href="/signup">
                Criar conta do bar
              </a>
            ) : (
              <OnsideBarInterestForm />
            )}
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
            <p>ONSIDE · O JOGO É AQUI</p>
            <h2>
              SEU PRÓXIMO JOGO MERECE
              <br />
              <em>UMA RESPOSTA ANTES DE VOCÊ SAIR.</em>
            </h2>
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
              items={['Grátis', 'Sem newsletter', 'Acesso pelo seu e-mail']}
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
            <a href="#bares">Para bares</a>
            <a href="#duvidas">Dúvidas</a>
            <a href="mailto:contato@onside.sh">Contato</a>
          </div>
          <small>© 2026 Onside</small>
        </div>
      </footer>
    </div>
  )
}
