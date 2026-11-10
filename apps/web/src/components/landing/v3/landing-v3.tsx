import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
/** biome-ignore-all lint/performance/noImgElement: telas e fotos estáticas de public/landing/v3, com width e height. */
import { getEventEnd } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTRPC } from '@/utils/trpc'
import {
  DEFINITION_POINTS,
  FAQ_ITEMS,
  JOURNEY_STEPS,
  LANDING_COPY,
  OCCASION_ITEMS,
  PROBLEM_ITEMS,
  TICKER_BENEFITS
} from '../onside-landing-content'
import { startEffects } from './effects'
import {
  Arrow,
  Beer,
  Calendar,
  Check,
  People,
  Pin,
  Plus,
  Search,
  Stars,
  Tv
} from './icons'
import { startLeds } from './led'
import {
  BAR_SIGNUP_HREF,
  type Cta,
  SiteFooter,
  SiteNav,
  usePrimaryCta
} from './site-chrome'

/*
 * Landing v3 (WEB-501), do protótipo `docs/design/redesign-2026-11/landing`
 * com a copy do site atual (pedido do marketing, 05/11/2026; artifact
 * BDRkPQGG2C6DzF54zViB8C). Sistema visual em `DESIGN.md`. O texto vem de
 * `onside-landing-content.ts`, o mesmo do JSON-LD. O CSS é o do protótipo,
 * preso a `.lp3` (`landing-v3.css`), mais o do design (`landing-v3-site.css`). Os jogos do letreiro e do
 * exemplo do hero são os de hoje (`pubs.todayGames`). O hero tem dois caminhos
 * (B3 do canvas S4PzzkRwGY8kdMo2JD6bDy, 10/11/2026): o de verdade, em acid,
 * abre o Explorar; o exemplo, em papel, mostra bares fictícios e assume isso
 * antes do clique, porque a busca de antes parecia de verdade e o pessoal
 * travava nela.
 */

/** O título do problema em dois tons: o que os outros são, e o que não mostram. */
const PROBLEM_SPLIT = LANDING_COPY.problem.title.indexOf('não mostram')
const PROBLEM_TITLE = [
  LANDING_COPY.problem.title.slice(0, PROBLEM_SPLIT).trim(),
  LANDING_COPY.problem.title.slice(PROBLEM_SPLIT)
]

/**
 * `key` e `bars` só nos jogos de hoje: a chave é a da régua do Explorar
 * (`<startsAt>|<título>`, `?jogo=`) e `bars` é em quantos bares ele passa.
 */
type Game = {
  title: string
  time: string
  live: boolean
  key?: string
  bars?: number
}

/**
 * Com menos de `MIN_REAL_GAMES` jogos publicados hoje, o exemplo usa estes:
 * um ou dois jogos de verdade deixavam o exemplo pobre (dono, 10/11/2026).
 */
const MIN_REAL_GAMES = 3

/** Os jogos da demonstração. */
const EXAMPLE_GAMES: Game[] = [
  { title: 'Corinthians × Palmeiras', time: '21:30', live: false },
  { title: 'Lakers × Celtics', time: '22:00', live: false },
  { title: 'Flamengo × Fluminense', time: '19:00', live: false },
  { title: 'GP de São Paulo · Fórmula 1', time: '14:00', live: false }
]

const EXAMPLE_BARS = [
  ['Bar do Zé', 'BZ', '3 telões · som ligado · oferta da casa'],
  ['Arquibancada Bar', 'AB', 'telão · área externa · Pix'],
  ['Casa da Torcida', 'CT', 'projetor · cozinha até tarde']
] as const

const SPORTS = [
  'Futebol',
  'Basquete',
  'Vôlei',
  'Automobilismo',
  'Lutas',
  'Tênis',
  'NFL'
]
const TEAMS = [
  'Corinthians',
  'Flamengo',
  'Palmeiras',
  'São Paulo',
  'Lakers',
  'Celtics',
  'McLaren',
  'Ferrari',
  'Sesi Bauru',
  'Franca'
]

const MEDALS = [
  {
    id: 'bar1',
    label: '1 bar',
    name: 'Primeira Rodada',
    text: 'O primeiro jogo num bar pela Onside. O balcão validou, a medalha é sua.',
    step: 1
  },
  {
    id: 'bar5',
    label: '5 bares',
    name: 'Desbravador',
    text: 'Cinco bares diferentes. Cada um com a data e o lugar gravados no verso.',
    step: 2
  },
  {
    id: 'bar10',
    label: '10 bares',
    name: 'Rato de bar',
    text: 'Dez bares diferentes. Aqui já tem gente pedindo indicação para você.',
    step: 3
  },
  {
    id: 'bar25',
    label: '25 bares',
    name: 'Lenda do bairro',
    text: 'Vinte e cinco bares. Conta no ranking do mês com os amigos.',
    step: 4
  }
] as const
type Medal = (typeof MEDALS)[number]

const brasiliaTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit'
})

function useTodayGames(): Game[] {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.pubs.todayGames.queryOptions(),
    staleTime: 60_000
  })
  return useMemo(() => {
    const now = Date.now()
    return (data ?? []).flatMap((g) => {
      const start = new Date(g.startsAt)
      const end = getEventEnd({ startsAt: start, endsAt: null }).getTime()
      if (now >= end) return []
      return [
        {
          title: g.title,
          time: brasiliaTime.format(start),
          live: now >= start.getTime(),
          key: `${g.startsAt}|${g.title}`,
          bars: g.bars
        }
      ]
    })
  }, [data])
}

function Ring() {
  return (
    <svg
      viewBox="0 0 30 30"
      aria-hidden="true"
      style={{ width: '.62em', height: '.62em' }}
    >
      <circle
        cx="14"
        cy="14"
        r="10.5"
        fill="none"
        stroke="#12120f"
        strokeWidth="4.2"
      />
      <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
    </svg>
  )
}

/**
 * A dor de cada prova, só no celular; no computador ela está na lista ao
 * lado. Uma das duas está sempre em `display: none`, então o leitor de tela
 * lê cada dor uma vez.
 */
function ProblemCaption({ i }: { i: number }) {
  const p = PROBLEM_ITEMS[i]
  if (!p) return null
  return (
    <p className="evt">
      <b>{p.title}</b>
      {p.body}
    </p>
  )
}

function DefinitionNote({ i }: { i: number }) {
  const d = DEFINITION_POINTS[i]
  if (!d) return null
  return (
    <div className="note rv" data-to={i}>
      <span className="hp-n">{d.number}</span>
      <b>{d.text}</b>
    </div>
  )
}

/** A noite do jogo em três horários, um por passo, com a tela de cada um. */
const STEP_EXTRAS = [
  {
    time: '18:00',
    screen: '/landing/v3/tela-explorar.webp',
    facts: [
      [Search, 'Time'],
      [Search, 'Campeonato'],
      [Search, 'Esporte']
    ]
  },
  {
    time: '18:40',
    screen: '/landing/v3/tela-ia.webp',
    facts: [
      [Pin, 'Distância'],
      [Tv, 'Infraestrutura e telões'],
      [Beer, 'Preço médio'],
      [People, 'Perfil da torcida']
    ]
  },
  {
    time: '19:30',
    screen: '/landing/v3/tela-vou.webp',
    facts: [
      [Check, 'Escolha o bar'],
      [People, 'Chame a galera'],
      [Calendar, 'Informação atualizada']
    ]
  }
] as const

const OCCASION_ICONS = [Beer, Tv, People] as const

type Result = { game: Game; where: string }

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`

/**
 * O exemplo, assumido: bares fictícios com o selo, e logo abaixo o caminho de
 * verdade. Com jogo de hoje, quantos bares o passam e o Explorar já nele; com
 * a lista de exemplo, os jogos de hoje que houver (`todayCount`), senão a grade
 * dos próximos dias.
 */
function Results({
  result,
  cta,
  todayCount
}: {
  result: Result
  cta: Cta
  todayCount: number
}) {
  const { game } = result
  const real = game.key && game.bars ? game : null
  return (
    <>
      <div className="results">
        <header>
          <b>Assim aparece na Onside</b>
          <span className="ex">Exemplo</span>
        </header>
        <p className="hp-sub">
          {game.title} · perto de {result.where}
        </p>
        {EXAMPLE_BARS.map(([name, initials, meta], i) => (
          <div
            key={name}
            className="rbar"
            style={{ animationDelay: `${0.08 + i * 0.07}s` }}
          >
            <span className="thumb">{initials}</span>
            <span>
              <b>{name}</b>
              <small>{meta}</small>
            </span>
            <span className="t">
              {game.live ? (
                <span style={{ color: '#e8320c' }}>AO VIVO</span>
              ) : (
                game.time
              )}
              <small>{game.live ? 'agora' : 'hoje'}</small>
            </span>
          </div>
        ))}
        <footer>
          Esses bares não existem. Os de verdade estão logo abaixo.
        </footer>
      </div>
      <div className="path real hp-next">
        {real ? (
          <>
            <p className="hp-t">Agora com os bares de verdade</p>
            <p className="hp-txt">
              {real.title} passa em{' '}
              <b>{plural(real.bars ?? 0, 'bar', 'bares')}</b> na Onside hoje.
            </p>
            <a
              className="btn btn-ink"
              href={`/dashboard?jogo=${encodeURIComponent(real.key ?? '')}`}
              data-cta="results_game"
            >
              Ver onde passa perto de você
              <Arrow />
            </a>
          </>
        ) : (
          <>
            <p className="hp-t">
              {todayCount
                ? `Hoje tem ${plural(todayCount, 'jogo', 'jogos')} na Onside`
                : 'Hoje ainda não tem jogo publicado'}
            </p>
            <p className="hp-txt">
              {todayCount
                ? 'Veja onde passa e quais bares estão perto de você.'
                : 'Os bares publicam a grade ao longo do dia. Veja o que já está marcado para os próximos dias.'}
            </p>
            <a
              className="btn btn-ink"
              href={cta.href}
              data-cta={`results_${cta.kind}`}
            >
              {todayCount
                ? 'Ver os jogos de hoje'
                : 'Ver a grade dos próximos dias'}
              <Arrow />
            </a>
          </>
        )}
      </div>
    </>
  )
}

export function LandingV3() {
  const rootRef = useRef<HTMLDivElement>(null)
  const medalRef = useRef<HTMLIFrameElement>(null)
  const cta = usePrimaryCta()
  const today = useTodayGames()
  const games = today.length >= MIN_REAL_GAMES ? today : EXAMPLE_GAMES
  const [game, setGame] = useState('')
  const [where, setWhere] = useState('Vila Madalena')
  const [result, setResult] = useState<Result | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [medal, setMedal] = useState<Medal>(MEDALS[0])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const stopEffects = startEffects(root)
    const stopLeds = startLeds(root)
    return () => {
      stopEffects()
      stopLeds()
    }
  }, [])

  // O letreiro intercala os jogos com os benefícios, um a cada dois jogos.
  const tickerItems = (
    today.length
      ? today.map((g) => ({
          key: g.title + g.time,
          title: g.title,
          time: g.time,
          live: g.live,
          note: ''
        }))
      : SPORTS.map((s) => ({
          key: s,
          title: s,
          time: 'HOJE',
          live: false,
          note: 'na grade dos bares'
        }))
  ).flatMap((t, i) =>
    i % 2
      ? [t, { key: `bn-${i}`, benefit: TICKER_BENEFITS[(i >> 1) % 4] }]
      : [t]
  )

  const sol = LANDING_COPY.solution

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const picked = games.find((g) => g.title === game) ?? games[0]
    if (!picked) return
    setResult({ game: picked, where })
    // No celular o resultado nasce abaixo da dobra: a página vai até ele.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches
      resultRef.current?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'nearest'
      })
    })
  }

  function pickMedal(md: Medal) {
    setMedal(md)
    medalRef.current?.contentWindow?.postMessage(
      { medal: { id: md.id } },
      window.location.origin
    )
  }

  return (
    <div className="lp3" ref={rootRef}>
      <SiteNav />

      <main id="top">
        {/* ================= HERO ================= */}
        <section className="hero" id="hero" aria-labelledby="h1">
          <canvas
            className="led"
            data-led="hero"
            data-mode="hero"
            aria-hidden="true"
            tabIndex={-1}
          ></canvas>
          <div className="wrap hero-in">
            <div>
              <h1 id="h1" className="disp">
                <span className="w" style={{ animationDelay: '.05s' }}>
                  “Onde
                </span>{' '}
                <span className="w" style={{ animationDelay: '.11s' }}>
                  vai
                </span>{' '}
                <span className="w" style={{ animationDelay: '.17s' }}>
                  passar
                </span>{' '}
                <span className="w" style={{ animationDelay: '.23s' }}>
                  o
                </span>{' '}
                <span className="w" style={{ animationDelay: '.29s' }}>
                  jogo?”
                </span>{' '}
                <span className="w" style={{ animationDelay: '.35s' }}>
                  finalmente
                </span>{' '}
                <span className="w" style={{ animationDelay: '.41s' }}>
                  tem
                </span>{' '}
                <span className="w" style={{ animationDelay: '.47s' }}>
                  uma
                </span>{' '}
                <span className="w r" style={{ animationDelay: '.57s' }}>
                  (ótima)
                </span>{' '}
                <span className="w" style={{ animationDelay: '.67s' }}>
                  resposta.
                </span>
              </h1>
              <p className="lede">{LANDING_COPY.hero.body}</p>
              <p className="cta-lead">
                {LANDING_COPY.hero.ctaLead} <Arrow />
              </p>

              <div className="search">
                <div className="paths">
                  <div className="path real">
                    <p className="hp-t">
                      <span className="hp-n">1</span>Ache o seu de verdade
                    </p>
                    <p className="hp-txt">
                      Os jogos de hoje e os bares perto de você. Grátis, sem
                      conta para olhar.
                    </p>
                    <a
                      className="btn btn-ink"
                      href={cta.href}
                      data-cta={`hero_${cta.kind}`}
                    >
                      Abrir a Onside
                      <Arrow />
                    </a>
                  </div>
                  <form
                    method="post"
                    id="busca"
                    className="path demo"
                    aria-label="Exemplo de como a Onside mostra os bares"
                    onSubmit={onSearch}
                  >
                    <p className="hp-t">
                      <span className="hp-n">2</span>Ou teste com um exemplo
                    </p>
                    <p className="hp-tag">
                      Bares fictícios · só para ver como fica
                    </p>
                    <div className="fields">
                      <div className="field">
                        <label htmlFor="q-jogo">Jogo</label>
                        <div className="sel">
                          <select
                            id="q-jogo"
                            value={game || games[0]?.title}
                            onChange={(e) => setGame(e.target.value)}
                          >
                            {games.map((g) => (
                              <option key={g.title + g.time} value={g.title}>
                                {g.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="q-onde">Bairro</label>
                        <div className="sel">
                          <select
                            id="q-onde"
                            value={where}
                            onChange={(e) => setWhere(e.target.value)}
                          >
                            <option>Vila Madalena</option>
                            <option>Pinheiros</option>
                            <option>Moema</option>
                            <option>Tatuapé</option>
                            <option>Botafogo, Rio</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-ghost try" type="submit">
                      Ver como fica
                    </button>
                  </form>
                </div>
                <div className="trigger">
                  {LANDING_COPY.proof.map((p) => (
                    <span key={p}>
                      <Check size={16} />
                      {p}
                    </span>
                  ))}
                </div>
                <div aria-live="polite" ref={resultRef} className="answer">
                  {result && (
                    <Results
                      result={result}
                      cta={cta}
                      todayCount={today.length}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="hero-phone">
              <div className="float f1">
                <span
                  className="av"
                  style={{ background: '#e8320c', color: '#fff' }}
                >
                  M
                </span>
                <span>
                  <b>Marina vai assistir</b>
                  <small>Bar do Zé · 21:30</small>
                </span>
              </div>
              <div className="float f2">
                <span
                  className="av"
                  style={{ background: '#12120f', color: '#c9f135' }}
                >
                  <Tv />
                </span>
                <span>
                  <b>3 telões, som ligado</b>
                  <small>informado pelo bar</small>
                </span>
              </div>
              <div className="float f3">
                <span
                  className="av"
                  style={{ background: '#12120f', color: '#c9f135' }}
                >
                  $$
                </span>
                <span>
                  <b>Preço médio</b>
                  <small style={{ color: '#3d3d38' }}>R$ 80 por pessoa</small>
                </span>
              </div>
              <div className="phone">
                <img
                  src="/landing/v3/tela-explorar.webp"
                  alt="Tela Explorar do app Onside: mapa de Vila Madalena e Pinheiros com 8 bares com jogo hoje"
                  width="448"
                  height="976"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>
          <div className="ticker" role="marquee" aria-label="Jogos de hoje">
            <div className="track">
              {[0, 1].map((copy) =>
                tickerItems.map((t) =>
                  'benefit' in t ? (
                    <span
                      key={`${copy}-${t.key}`}
                      className="it bn"
                      aria-hidden={copy === 1 || undefined}
                    >
                      {t.benefit}
                    </span>
                  ) : (
                    <span
                      key={`${copy}-${t.key}`}
                      className="it"
                      aria-hidden={copy === 1 || undefined}
                    >
                      <span className={t.live ? 'lv' : 'tm'}>
                        {t.live ? '● AO VIVO' : t.time}
                      </span>
                      {t.title}
                      {t.note && <span className="hp-n">{t.note}</span>}
                    </span>
                  )
                )
              )}
            </div>
          </div>
        </section>

        {/* ================= O PROBLEMA (Google Maps e Instagram) ================= */}
        <section className="sec wrap" id="produto" aria-labelledby="h-prob">
          <p className="kick rv">{LANDING_COPY.problem.kicker}</p>
          <h2 id="h-prob" className="disp rv">
            {PROBLEM_TITLE[0]} <span className="h2-2">{PROBLEM_TITLE[1]}</span>
          </h2>
          <div className="prob">
            {/* No celular vira carrossel, com a dor de cada prova embaixo dela. */}
            <div className="pile rv" id="lp3-pile">
              <div className="ev ev-photo">
                <span className="num">01</span>
                <div className="ph" aria-hidden="true">
                  <span className="stamp">Sem jogo na foto</span>
                </div>
                <div className="cap" aria-hidden="true">
                  <b>Bar do Zé</b>
                  <span>publicada há 2 anos</span>
                </div>
                <ProblemCaption i={0} />
              </div>
              <div className="ev ev-rev">
                <span className="num">02</span>
                <div aria-hidden="true">
                  <div className="hd">
                    <Stars n={4} />
                    4,4<small>1.284 avaliações</small>
                  </div>
                  <div className="rev">
                    <span className="who">
                      Carla M.
                      <Stars n={5} />
                    </span>
                    Porção de fritas ótima e garçom muito atencioso. Preço
                    justo!
                  </div>
                  <div className="rev">
                    <span className="who">
                      Rodrigo S.
                      <Stars n={4} />
                    </span>
                    Ambiente agradável, chopp gelado. Voltaria com a família.
                  </div>
                  <span className="ask">E em dia de jogo?</span>
                </div>
                <ProblemCaption i={1} />
              </div>
              <div className="ev ev-chat">
                <span className="num">03</span>
                <div className="m" aria-hidden="true">
                  <span className="who" style={{ color: '#c4290a' }}>
                    Lucas
                  </span>
                  será que passa o jogo lá?
                </div>
                <div className="m" aria-hidden="true">
                  <span className="who" style={{ color: '#2f55c7' }}>
                    Rafa
                  </span>
                  sei lá, e se tiver sem som
                </div>
                <div className="m me" aria-hidden="true">
                  melhor ver em casa de novo
                </div>
                <ProblemCaption i={2} />
              </div>
            </div>
            <div className="rail-dots" id="lp3-pdots" aria-hidden="true">
              <i className="on"></i>
              <i></i>
              <i></i>
            </div>
            <div className="pains-wrap">
              <ul className="pains">
                {PROBLEM_ITEMS.map((p) => (
                  <li key={p.id} className="rv">
                    <span className="ic">{p.number}</span>
                    <span>
                      <b>{p.title}</b>
                      <p>{p.body}</p>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ================= ESCOLHA COM CONFIANÇA ================= */}
        <section className="conf" id="bar-por-dentro" aria-labelledby="h-anno">
          <div className="wrap sec">
            <p className="kick rv">{sol.kicker}</p>
            <h2 id="h-anno" className="disp rv">
              {sol.title[0]}{' '}
              <span className="h2-2" style={{ display: 'inline' }}>
                {sol.title[1]}
              </span>{' '}
              {sol.title[2]}
            </h2>
            <p className="lede rv">
              {sol.body[0]} <b>{sol.body[1]}</b> {sol.body[2]}
            </p>
            {/* As notas apontam para a tela pelo índice (`data-to`). */}
            <div className="anno" id="lp3-anno">
              <svg className="lines" id="lp3-lines" aria-hidden="true"></svg>
              <div className="col l">
                <DefinitionNote i={0} />
              </div>
              <div className="phone" id="lp3-annophone">
                <img
                  src="/landing/v3/tela-bar.webp"
                  alt="Página do Bar do Zé no app: preço médio por pessoa, o jogo de hoje no telão, a infraestrutura do bar e quantas pessoas vão"
                  width="448"
                  height="976"
                  loading="lazy"
                />
                <span className="target" style={{ left: '40%', top: '74%' }}>
                  <span>1</span>
                </span>
                <span className="target" style={{ left: '66%', top: '34.6%' }}>
                  <span>2</span>
                </span>
                <span className="target" style={{ left: '86%', top: '72.4%' }}>
                  <span>3</span>
                </span>
              </div>
              <div className="col r">
                <DefinitionNote i={1} />
                <DefinitionNote i={2} />
              </div>
            </div>
            <p className="closing rv">
              {sol.closing[0]} <b>{sol.closing[1]}</b>
            </p>
          </div>
        </section>

        {/* ================= COMO FUNCIONA ================= */}
        <section
          className="how on-ink"
          id="como-funciona"
          aria-labelledby="h-how"
        >
          <div className="wrap sec" style={{ paddingBottom: '12vh' }}>
            <p className="kick rv">{LANDING_COPY.journey.kicker}</p>
            <h2 id="h-how" className="disp rv">
              Tudo isso seguindo apenas{' '}
              <span className="h2-2">três passos simples.</span>
            </h2>
            <div className="mnav" aria-hidden="true">
              <div className="digits" id="lp3-mdigits">
                <span>1</span>
                <span>8</span>
                <span className="c">:</span>
                <span>0</span>
                <span>0</span>
              </div>
              <div className="prog" id="lp3-mprog">
                {JOURNEY_STEPS.map((step, i) => (
                  <i key={step.id} className={i ? undefined : 'on'}></i>
                ))}
              </div>
              <span className="mhint">
                deslize
                <Arrow />
              </span>
            </div>
            <div className="how-grid">
              <div className="steps" id="lp3-steps">
                {JOURNEY_STEPS.map((step, i) => {
                  const extra = STEP_EXTRAS[i]
                  if (!extra) return null
                  return (
                    <article
                      key={step.id}
                      className={i ? 'step' : 'step on'}
                      data-i={i}
                      data-t={extra.time}
                    >
                      <div className="clock">
                        {step.number} · {extra.time}
                      </div>
                      <h3>{step.title}</h3>
                      {step.variant === 'search' && (
                        <span className="q">
                          {LANDING_COPY.journey.searchTyped}
                        </span>
                      )}
                      <p>{step.body}</p>
                      <ul className="facts">
                        {extra.facts.map(([Icon, label]) => (
                          <li key={label}>
                            <Icon />
                            {label}
                          </li>
                        ))}
                      </ul>
                      <div className="mphone phone">
                        <img
                          src={extra.screen}
                          alt=""
                          loading="lazy"
                          width="448"
                          height="976"
                        />
                      </div>
                    </article>
                  )
                })}
              </div>
              <div className="stick" aria-hidden="true">
                <div className="board">
                  <div className="digits" id="lp3-digits">
                    <span>1</span>
                    <span>8</span>
                    <span className="c">:</span>
                    <span>0</span>
                    <span>0</span>
                  </div>
                  <div className="prog" id="lp3-prog">
                    {JOURNEY_STEPS.map((step, i) => (
                      <i key={step.id} className={i ? undefined : 'on'}></i>
                    ))}
                  </div>
                </div>
                <div className="phone">
                  <div className="screens" id="lp3-screens">
                    {STEP_EXTRAS.map((extra, i) => (
                      <img
                        key={extra.screen}
                        className={i ? undefined : 'on'}
                        src={extra.screen}
                        alt=""
                        width="448"
                        height="976"
                        loading={i ? 'lazy' : undefined}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= OCASIÕES ================= */}
        <section className="sec wrap" aria-labelledby="h-occ">
          <div className="occ-grid">
            <div>
              <p className="kick rv">{LANDING_COPY.variety.kicker}</p>
              <h2
                id="h-occ"
                className="disp rv"
                style={{ fontSize: 'clamp(44px,5.4vw,84px)' }}
              >
                Encontre o espaço certo{' '}
                <span className="h2-2">para o seu jeito de torcer.</span>
              </h2>
              <p className="lede rv">{LANDING_COPY.variety.body}</p>
            </div>
            <ul className="occ">
              {OCCASION_ITEMS.map((o, i) => {
                const Icon = OCCASION_ICONS[i] ?? Beer
                return (
                  <li key={o.id} className={o.highlight ? 'rv hl' : 'rv'}>
                    <span className="hp-n">{o.number}</span>
                    <b>{o.title}</b>
                    <span className="tg">
                      <Icon />
                      {o.tag}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* ================= VERIFICADA ================= */}
        <section className="ver on-ink" aria-labelledby="h-ver">
          <canvas
            className="led"
            data-led="crowd"
            data-mode="soft"
            aria-hidden="true"
            tabIndex={-1}
          ></canvas>
          <div className="wrap sec ver-grid">
            <div>
              <h2 id="h-ver" className="disp rv">
                Nota de quem foi.{' '}
                <span className="h2-2">Não de quem passou na porta.</span>
              </h2>
              <p
                className="lede rv"
                style={{ color: 'var(--soft-ink)', marginTop: '26px' }}
              >
                Só entra na nota quem validou o código no balcão ou fez check-in
                no bar. E a avaliação pergunta o que importa em dia de jogo:
                som, telão, lotação.
              </p>
              <div className="score rv">
                <div className="big">4,6</div>
                <div className="hp-sub">
                  <b>Bar do Zé em dia de jogo</b>
                  <span>42 avaliações verificadas · 88% voltariam</span>
                </div>
                <div className="bars5 pre" id="lp3-bars5">
                  <div>
                    <span>5</span>
                    <i style={{ ['--w' as string]: '68%' }}></i>
                    <span>68%</span>
                  </div>
                  <div>
                    <span>4</span>
                    <i style={{ ['--w' as string]: '21%' }}></i>
                    <span>21%</span>
                  </div>
                  <div>
                    <span>3</span>
                    <i style={{ ['--w' as string]: '7%' }}></i>
                    <span>7%</span>
                  </div>
                  <div>
                    <span>2</span>
                    <i style={{ ['--w' as string]: '2%' }}></i>
                    <span>2%</span>
                  </div>
                  <div>
                    <span>1</span>
                    <i style={{ ['--w' as string]: '2%' }}></i>
                    <span>2%</span>
                  </div>
                </div>
                <div className="weigh">
                  <p>O que pesou</p>
                  <div className="chips">
                    <span className="chip">Som do jogo</span>
                    <span className="chip">Telão</span>
                    <span className="chip">Atendimento</span>
                    <span className="chip neg">Lotado</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="medal-wrap rv">
              <div
                className="confetti"
                id="lp3-confetti"
                aria-hidden="true"
              ></div>
              <div className="stage">
                <iframe
                  ref={medalRef}
                  src="/landing/v3/medalha.html#bar1"
                  title={`Medalha ${medal.name} em 3D. Arraste para girar.`}
                  loading="lazy"
                ></iframe>
                <span className="hint" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
                  </svg>
                  Arraste para girar
                </span>
              </div>
              <fieldset className="mpick" aria-label="Escolher medalha">
                {MEDALS.map((md) => (
                  <button
                    key={md.id}
                    type="button"
                    className={md.id === medal.id ? 'on' : undefined}
                    aria-pressed={md.id === medal.id}
                    onClick={() => pickMedal(md)}
                  >
                    {md.label}
                  </button>
                ))}
              </fieldset>
              <div className="medal-cap">
                <b>{medal.name}</b>
                <p>{medal.text}</p>
                <div className="lad">
                  {MEDALS.map((md, i) => (
                    <span
                      key={md.id}
                      className={i < medal.step ? 'on' : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ESPORTES ================= */}
        <section className="sports" aria-label="Esportes na Onside">
          <div className="row a" aria-hidden="true">
            {[0, 1].map((copy) =>
              SPORTS.map((w) => (
                <span key={`${copy}-${w}`}>
                  {w}
                  <Ring />
                </span>
              ))
            )}
          </div>
          <div className="row b" aria-hidden="true">
            {[0, 1].map((copy) =>
              TEAMS.map((w) => (
                <span key={`${copy}-${w}`}>
                  {w}
                  <Ring />
                </span>
              ))
            )}
          </div>
          <p
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)'
            }}
          >
            Futebol, basquete, vôlei, automobilismo, lutas e outros eventos.
          </p>
        </section>

        {/* ================= O ESPORTE É ENCONTRO ================= */}
        <section className="ver on-ink" aria-labelledby="h-com">
          <canvas
            className="led"
            data-led="hero"
            data-mode="soft"
            aria-hidden="true"
            tabIndex={-1}
          ></canvas>
          <div className="wrap sec">
            <div className="com">
              <p className="kick rv">{LANDING_COPY.community.kicker}</p>
              <h2 id="h-com" className="disp rv">
                {LANDING_COPY.community.title[0]}{' '}
                <span className="h2-2" style={{ display: 'inline' }}>
                  {LANDING_COPY.community.title[1]}
                </span>
              </h2>
              <p className="lede rv">{LANDING_COPY.community.body}</p>
              <a
                className="btn btn-acid rv"
                href={cta.href}
                data-cta={`community_${cta.kind}`}
              >
                {cta.short}
              </a>
            </div>
          </div>
        </section>

        {/* ================= PARA BARES ================= */}
        <section className="pub" id="para-bares" aria-labelledby="h-pub">
          <div className="wrap sec">
            <div className="pub-head">
              <h2 id="h-pub" className="disp rv">
                Tem um bar?{' '}
                <span className="h2-2">Encha a casa em dia de jogo.</span>
              </h2>
              <div className="rv">
                <span className="hp-tag">
                  <em>{ONBOARDING_TRIAL.days} DIAS</em>de Elite grátis, sem
                  cartão
                </span>
                <p className="lede" style={{ marginTop: '20px' }}>
                  Publique a grade, apareça para quem procura aquele jogo perto
                  de você e veja quem marcou que vai e quem chegou de verdade.
                </p>
              </div>
            </div>
            <div className="browser rv" id="lp3-browser">
              <div className="bar">
                <i></i>
                <i></i>
                <i></i>
                <span>onside.sh/admin</span>
              </div>
              <img
                src="/landing/v3/painel.webp"
                alt="Painel do bar na Onside: Hoje na casa, com jogos, quem vai assistir, códigos validados, a noite, oferta da casa e desempenho"
                width="2880"
                height="1800"
                loading="lazy"
              />
            </div>
            <div className="pts">
              <div className="rv">
                <b>Grade em minutos</b>
                <p>
                  Escolha o jogo no catálogo, marque telão e som e publique.
                  Oferta da casa por jogo no Elite.
                </p>
              </div>
              <div className="rv">
                <b>Quem vai, quem chegou</b>
                <p>
                  Veja quantos marcaram que vão e quantos códigos o balcão
                  validou, jogo a jogo.
                </p>
              </div>
              <div className="rv">
                <b>Público que se prova</b>
                <p>
                  Desempenho dos últimos 30 dias, comparado com o normal da sua
                  casa naquele dia da semana.
                </p>
              </div>
            </div>
            <div className="pub-cta rv">
              <a
                className="btn btn-ink"
                href={BAR_SIGNUP_HREF}
                data-cta="pub_pub_signup"
              >
                Cadastrar meu bar
              </a>
              <small>
                Sem cartão no cadastro. Depois do teste, você escolhe.
              </small>
            </div>
          </div>
        </section>

        {/* ================= FAQ ================= */}
        {/* As mesmas perguntas do JSON-LD `FAQPage` da home (`FAQ_ITEMS`). */}
        <section className="sec wrap" id="duvidas" aria-labelledby="h-faq">
          <div className="faq-grid">
            <div>
              <p className="kick rv">{LANDING_COPY.faq.kicker}</p>
              <h2
                id="h-faq"
                className="disp rv"
                style={{ fontSize: 'clamp(46px,5.4vw,84px)' }}
              >
                {LANDING_COPY.faq.title[0]}{' '}
                <span className="h2-2">{LANDING_COPY.faq.title[1]}</span>
              </h2>
            </div>
            <div className="faq">
              {FAQ_ITEMS.map((item, i) => (
                <details key={item.id} open={i === 0 || undefined}>
                  <summary>
                    {item.question}
                    <span className="pm" aria-hidden="true">
                      <Plus />
                    </span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FINAL ================= */}
        <section className="final" id="comecar" aria-labelledby="h-final">
          <canvas
            className="led"
            data-led="scarf"
            data-mode="soft"
            aria-hidden="true"
            tabIndex={-1}
          ></canvas>
          <div className="wrap sec">
            <p className="kick rv">{LANDING_COPY.final.kicker}</p>
            <h2 id="h-final" className="disp rv">
              {LANDING_COPY.final.title[0]}{' '}
              <span className="r">{LANDING_COPY.final.title[1]}</span>
            </h2>
            <div className="acts rv">
              <a
                className="btn btn-acid"
                href={cta.href}
                data-cta={`final_${cta.kind}`}
              >
                {cta.short}
              </a>
              <a
                className="btn btn-ghost"
                style={{ color: 'var(--paper)' }}
                href="#como-funciona"
              >
                Como funciona
              </a>
            </div>
            <div className="trigger rv">
              {LANDING_COPY.final.proof.map((p) => (
                <span key={p}>
                  <Check size={16} />
                  {p}
                </span>
              ))}
            </div>
            <p className="alt">
              Tem um bar?{' '}
              <a
                href={BAR_SIGNUP_HREF}
                data-cta="final_pub_signup"
                style={{ color: 'var(--paper)', fontWeight: '700' }}
              >
                Cadastre seu bar
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
