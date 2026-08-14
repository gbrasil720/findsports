import { useQuery } from '@tanstack/react-query'
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
import { analytics } from '../../lib/analytics'
import { useTRPC } from '../../utils/trpc'
import { OnsideAppDemo } from './onside-app-demo'
import { OnsideBarInterestForm, OnsideFanWaitlistForm } from './onside-waitlist'

type NavItem = { id: string; label: string; href: string }
type TickerLiveItem = {
  id: string
  timeLabel: string
  event: string
  place: string
}
type TickerBenefitItem = { id: string; text: string }
type ProblemItem = {
  id: string
  number: string
  title: string
  body: string
}
type DefinitionPoint = { id: string; number: string; text: string }
type JourneyStep = {
  id: string
  number: string
  title: string
  body: string
  variant: 'search' | 'compare' | 'arrival'
  reverse?: boolean
}
type TrustItem = { id: string; number: string; title: string; body: string }
type FaqItem = { id: string; question: string; answer: string }

const NAV_ITEMS: NavItem[] = [
  { id: 'produto', label: 'A Onside', href: '#produto' },
  { id: 'como-funciona', label: 'Como funciona', href: '#como-funciona' },
  { id: 'bares', label: 'Para bares', href: '#bares' },
  { id: 'duvidas', label: 'Dúvidas', href: '#duvidas' }
]

const TICKER_BENEFITS: TickerBenefitItem[] = [
  { id: 'b1', text: 'BUSQUE PELO JOGO' },
  { id: 'b2', text: 'COMPARE O AMBIENTE' },
  { id: 'b3', text: 'VEJA QUANDO A GRADE FOI ATUALIZADA' },
  { id: 'b4', text: 'CADASTRE SUA CIDADE' }
]

const PROBLEM_ITEMS: ProblemItem[] = [
  {
    id: 'p1',
    number: '01',
    title: 'Você encontra o bar, não a transmissão.',
    body: 'O Google mostra endereço e horário, mas não confirma qual partida estará no telão ou se haverá som.'
  },
  {
    id: 'p2',
    number: '02',
    title: 'Os stories somem antes da rodada.',
    body: 'A programação fica espalhada e quase nunca explica lotação, estrutura ou perfil da torcida.'
  },
  {
    id: 'p3',
    number: '03',
    title: 'A dúvida só acaba quando você chega.',
    body: 'Lotado, sem som ou em outro jogo: hoje, a confirmação vem tarde demais.'
  }
]

const DEFINITION_POINTS: DefinitionPoint[] = [
  {
    id: 'd1',
    number: '01',
    text: 'A partida exata, não apenas “passa futebol”.'
  },
  {
    id: 'd2',
    number: '02',
    text: 'A grade publicada pelo bar, com data de atualização.'
  },
  {
    id: 'd3',
    number: '03',
    text: 'Sem confirmação recente? A interface mostra a dúvida.'
  }
]

const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: 'j1',
    number: '01',
    title: 'Busque seu jogo.',
    body: 'Procure por time, campeonato ou esporte.',
    variant: 'search'
  },
  {
    id: 'j2',
    number: '02',
    title: 'Compare o ambiente.',
    body: 'Veja distância, lotação informada, som, telões e perfil da torcida.',
    variant: 'compare',
    reverse: true
  },
  {
    id: 'j3',
    number: '03',
    title: 'Vá sabendo o que esperar.',
    body: 'Escolha o bar, chame a galera e confira quando a informação foi atualizada.',
    variant: 'arrival'
  }
]

const BAR_BENEFITS = [
  'Publique a programação da semana em um só lugar.',
  'Atualize estrutura e lotação quando necessário.',
  'Seja encontrado por jogo e distância.'
] as const

const TRUST_ITEMS: TrustItem[] = [
  {
    id: 't1',
    number: '01',
    title: 'Grade publicada pela casa.',
    body: 'O bar informa o evento específico e a estrutura prevista.'
  },
  {
    id: 't2',
    number: '02',
    title: 'Confirmação de quem está lá.',
    body: 'A comunidade poderá atualizar som, lotação e transmissão.'
  },
  {
    id: 't3',
    number: '03',
    title: 'Horário sempre visível.',
    body: 'Cada informação mostra quando foi publicada ou confirmada.'
  }
]

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'f1',
    question: 'A Onside já funciona na minha cidade?',
    answer:
      'Ainda não. Estamos medindo a demanda de torcedores e a adesão de bares para escolher as primeiras cidades do piloto.'
  },
  {
    id: 'f2',
    question: 'A Onside será gratuita para torcedores?',
    answer:
      'Sim. Buscar partidas, comparar bares e consultar a grade será gratuito para quem assiste.'
  },
  {
    id: 'f3',
    question: 'Como vou saber se a informação está atualizada?',
    answer:
      'A proposta é mostrar quem publicou ou confirmou a informação e quando isso aconteceu. Sem confirmação recente, a interface deve deixar a dúvida visível.'
  },
  {
    id: 'f4',
    question: 'É só para futebol?',
    answer:
      'Não. Futebol será o ponto de partida, mas a mesma busca pode incluir basquete, vôlei, automobilismo, lutas e outros eventos.'
  },
  {
    id: 'f5',
    question: 'Como funciona para bares?',
    answer:
      'O bar manifesta interesse no piloto e informa a casa, a cidade e um contato. Quando a operação avançar naquela região, a Onside entra em contato com os próximos passos.'
  },
  {
    id: 'f6',
    question: 'Como as primeiras cidades serão escolhidas?',
    answer:
      'Pela combinação entre demanda de torcedores e bares interessados. Por isso os dois formulários pedem a cidade.'
  },
  {
    id: 'f7',
    question: 'O que acontece com meus dados?',
    answer:
      'Usamos os dados para registrar o interesse e avisar sobre o lançamento pelo e-mail informado.'
  }
]

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
          Levar a Onside à minha cidade{' '}
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
            Levar a Onside à minha cidade
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
  const { data: eliteEvents = [] } = useQuery({
    ...trpc.pubs.getEliteEvents.queryOptions(),
    staleTime: 60_000
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
  useEffect(() => {
    function handleCtaClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      // Skip form controls — forms emit dedicated funnel events only
      if (target.closest('form')) return
      const ctaEl = target.closest('[data-cta]')
      if (!(ctaEl instanceof HTMLElement)) return
      const cta = ctaEl.dataset.cta
      if (cta) analytics.landingCtaClicked(cta)
    }

    document.addEventListener('click', handleCtaClick)
    return () => document.removeEventListener('click', handleCtaClick)
  }, [])

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
                  href="#lista"
                  data-cta="hero_city_waitlist"
                >
                  Levar a Onside à minha cidade{' '}
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
                  '1 e-mail no lançamento'
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
              href="#lista"
              data-cta="community_city_waitlist"
            >
              Levar a Onside à minha cidade{' '}
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
                AJUDE A ONSIDE A CHEGAR
              </p>
              <h2>
                LEVE A ONSIDE
                <br />À SUA <em>CIDADE.</em>
              </h2>
              <p>
                As primeiras cidades serão escolhidas pela demanda de torcedores
                e pela adesão de bares. Seu cadastro conta na demanda da sua
                cidade e você recebe um e-mail quando houver lançamento por
                perto.
              </p>
              <ProofList
                className="onside-waitlist-facts"
                items={[
                  'Grátis para torcedores',
                  'Sem newsletter',
                  '1 e-mail no lançamento'
                ]}
              />
            </div>
            <OnsideFanWaitlistForm />
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
                href="#bar-form"
                data-cta="bars_register_interest"
              >
                Quero participar do piloto{' '}
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
            <OnsideBarInterestForm />
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
              href="#lista"
              data-cta="final_city_waitlist"
            >
              Levar a Onside à minha cidade{' '}
              <span className="onside-inline-icon" aria-hidden="true">
                <ArrowRight size={16} aria-hidden="true" focusable="false" />
              </span>
            </a>
            <ProofList
              className="onside-final-proof"
              items={['Grátis', 'Sem newsletter', '1 e-mail no lançamento']}
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
