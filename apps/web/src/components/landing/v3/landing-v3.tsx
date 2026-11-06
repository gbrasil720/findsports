/** biome-ignore-all lint/performance/noImgElement: telas e fotos estáticas de public/landing/v3, com width e height. */
import { getEventEnd } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CookiePreferencesButton } from '@/components/consent/cookie-consent'
import { useTRPC } from '@/utils/trpc'
import {
  LANDING_COPY,
  NAV_ITEMS,
  SOCIAL_LINKS,
  TICKER_BENEFITS
} from '../onside-landing-content'
import { startEffects } from './effects'
import { Arrow, Check, Logo, Tv } from './icons'
import { startLeds } from './led'

/*
 * Landing v3 (WEB-501), do protótipo `docs/design/redesign-2026-11/landing`
 * com a copy do site atual (pedido do marketing, 05/11/2026; artifact
 * BDRkPQGG2C6DzF54zViB8C). Sistema visual em `DESIGN.md`. O texto vem de
 * `onside-landing-content.ts`, o mesmo do JSON-LD. O CSS é o do protótipo,
 * preso a `.lp3` (`landing-v3.css`), mais o do design (`landing-v3-site.css`). Os jogos do letreiro e da busca
 * são os de hoje (`pubs.todayGames`); os bares do resultado são exemplo até o
 * Explorar aberto sem conta (WEB-502/503) existir.
 */

const BAR_SIGNUP_HREF = '/signup?role=pub'

/** Com sessão, as chamadas levam ao app; sem, ao cadastro (WEB-278). */
function usePrimaryCta() {
  const session = useRouteContext({
    from: '__root__',
    select: (ctx) => Boolean(ctx.session)
  })
  return session
    ? { session, href: '/app', kind: 'app', short: 'Ver jogos de hoje' }
    : {
        session,
        href: '/signup',
        kind: 'signup',
        short: LANDING_COPY.primaryCta
      }
}
type Cta = ReturnType<typeof usePrimaryCta>

type Game = { title: string; time: string; live: boolean }

/** Sem jogo publicado hoje: os da demonstração, marcados como exemplo. */
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
  'NBA',
  'NFL',
  'UFC',
  'Fórmula 1',
  'Tênis',
  'Vôlei',
  'NBB'
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
          live: now >= start.getTime()
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

type Result = { game: Game; where: string; example: boolean }

function Results({ result, cta }: { result: Result; cta: Cta }) {
  const { game } = result
  return (
    <div className="results">
      <header>
        <b>{game.title}</b>
        <span>
          perto de {result.where}
          <span className="ex">EXEMPLO</span>
        </span>
      </header>
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
        <span>Bares de exemplo. Na Onside, os de verdade, perto de você.</span>
        <a
          className="btn btn-ink"
          href={cta.href}
          data-cta={`results_${cta.kind}`}
        >
          Ver os bares
        </a>
      </footer>
    </div>
  )
}

export function LandingV3() {
  const rootRef = useRef<HTMLDivElement>(null)
  const medalRef = useRef<HTMLIFrameElement>(null)
  const cta = usePrimaryCta()
  const today = useTodayGames()
  const games = today.length ? today : EXAMPLE_GAMES
  const [game, setGame] = useState('')
  const [where, setWhere] = useState('Vila Madalena')
  const [result, setResult] = useState<Result | null>(null)
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

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const picked = games.find((g) => g.title === game) ?? games[0]
    if (picked) setResult({ game: picked, where, example: !today.length })
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
      <nav className="nav" id="lp3-nav" aria-label="Principal">
        <a className="logo" href="#top" aria-label="Onside, início">
          <Logo />
          <b>
            ONSIDE<i></i>
          </b>
        </a>
        <div className="links">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
        <div className="right">
          <a
            className="btn btn-ghost"
            href={BAR_SIGNUP_HREF}
            data-cta="nav_pub_signup"
          >
            Cadastre seu bar
          </a>
          <a
            className="btn btn-acid"
            href={cta.href}
            data-cta={`nav_${cta.kind}`}
          >
            {cta.short}
          </a>
        </div>
      </nav>

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
              <div className="live-pill">
                <span className="dot"></span>
                {LANDING_COPY.hero.eyebrow}
              </div>
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
                <form
                  method="post"
                  id="busca"
                  aria-label="Buscar bares por jogo"
                  onSubmit={onSearch}
                >
                  <div className="field">
                    <label htmlFor="q-jogo">
                      {LANDING_COPY.journey.searchPlaceholder}
                    </label>
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
                    <label htmlFor="q-onde">Onde</label>
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
                  <button className="btn btn-acid go" type="submit">
                    Ver bares
                    <Arrow />
                  </button>
                </form>
                <div className="trigger">
                  {LANDING_COPY.proof.map((p) => (
                    <span key={p}>
                      <Check size={16} />
                      {p}
                    </span>
                  ))}
                </div>
                <div aria-live="polite">
                  {result && <Results result={result} cta={cta} />}
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
                      {t.note && <span className="n">{t.note}</span>}
                    </span>
                  )
                )
              )}
            </div>
          </div>
        </section>

        {/* ================= PROBLEMA ================= */}
        <section className="sec wrap" aria-labelledby="h-prob">
          <h2 id="h-prob" className="disp rv">
            Toda semana, a mesma conversa no grupo.{' '}
            <span className="h2-2">E alguém chega num bar sem som.</span>
          </h2>
          <div className="prob">
            <div className="chat rv" id="lp3-chat">
              <div className="top">
                <span className="grp">FQ</span>
                <span>
                  <b>Futebol de quarta</b>
                  <small>Lucas, Bia, Rafa, Marina, você</small>
                </span>
              </div>
              <button className="replay" id="lp3-replay" type="button">
                Ver de novo
              </button>
              <div className="msgs" id="lp3-msgs">
                <div className="m">
                  <span className="who" style={{ color: '#c4290a' }}>
                    Lucas
                  </span>
                  clássico hoje 21:30, onde a gente vê?
                </div>
                <div className="m">
                  <span className="who" style={{ color: '#5b6d0c' }}>
                    Bia
                  </span>
                  aquele boteco da esquina? não sei se passa
                </div>
                <div className="m">
                  <span className="who" style={{ color: '#2f55c7' }}>
                    Rafa
                  </span>
                  da última vez a TV tava no outro jogo e sem som
                </div>
                <div className="m">
                  <span className="who" style={{ color: '#8a3fb0' }}>
                    Marina
                  </span>
                  alguém liga lá pra perguntar?
                </div>
                <div className="m card">
                  <div className="in">
                    <div className="url">
                      onside.sh/jogo/corinthians-x-palmeiras
                    </div>
                    <div className="gm">Cor × Pal hoje, 21:30</div>
                    <div className="meta">8 bares perto de Vila Madalena</div>
                  </div>
                  <div className="bars">
                    <span className="a">Bar do Zé · 3 telões</span>
                    <span>Arquibancada · som ligado</span>
                  </div>
                </div>
                <div className="m">
                  <span className="who" style={{ color: '#c4290a' }}>
                    Lucas
                  </span>
                  Bar do Zé. 34 já marcaram, entre eles a Marina
                </div>
                <div className="m">
                  <span className="who" style={{ color: '#8a3fb0' }}>
                    Marina
                  </span>
                  já to lá kkk
                </div>
              </div>
            </div>
            <div>
              <ul className="pains">
                <li className="rv">
                  <span className="ic">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>
                    <b>O mapa mostra o endereço.</b>
                    <p>
                      Não diz se aquele bar vai passar o seu jogo, nem em qual
                      TV.
                    </p>
                  </span>
                </li>
                <li className="rv">
                  <span className="ic">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.6 4h6.8l1.5 2.4H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.4a2 2 0 0 1 2-2h3.1zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>
                    <b>O perfil do bar mostra o chopp.</b>
                    <p>
                      A foto é de um sábado qualquer. O som do jogo, ninguém
                      sabe.
                    </p>
                  </span>
                </li>
                <li className="rv">
                  <span className="ic">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>
                    <b>A avaliação fala da comida.</b>
                    <p>
                      Sobre lotação, telão e som em dia de clássico, quase nada.
                    </p>
                  </span>
                </li>
              </ul>
              <p className="verdict rv">
                <span className="mark">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{ color: '#12120f' }}
                  >
                    <path
                      d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                A Onside pergunta antes de você sair. Para o bar, jogo por jogo.
              </p>
            </div>
          </div>
        </section>

        {/* ================= COMO FUNCIONA ================= */}
        <section className="how on-ink" id="como" aria-labelledby="h-how">
          <div className="wrap sec" style={{ paddingBottom: '12vh' }}>
            <h2 id="h-how" className="disp rv">
              A noite do jogo, <span className="h2-2">das 18h ao balcão.</span>
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
                <i className="on"></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </div>
              <span className="mhint">
                deslize
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </div>
            <div className="how-grid">
              <div className="steps" id="lp3-steps">
                <article className="step on" data-i="0" data-t="18:00">
                  <div className="clock">18:00</div>
                  <h3>Veja o que passa hoje, perto de você</h3>
                  <p>
                    O mapa abre no seu raio com os bares que publicaram jogo
                    hoje. Vermelho é ao vivo. Toque e veja a grade da casa.
                  </p>
                  <ul className="facts">
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
                          fill="currentColor"
                        />
                      </svg>
                      Raio de 500 m a 5 km
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <rect
                          x="2.5"
                          y="4"
                          width="19"
                          height="13"
                          rx="2.5"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <rect
                          x="8"
                          y="18.6"
                          width="8"
                          height="2.4"
                          rx="1.2"
                          fill="currentColor"
                        />{' '}
                        <path
                          d="M4.5 6.5h15v8h-15z"
                          fill="currentColor"
                          opacity="0.55"
                        />{' '}
                        <circle
                          cx="18"
                          cy="8.2"
                          r="1.7"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Telão e som por jogo
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 22a7 7 0 0 1-7-7c0-4.6 3.5-6 3.5-10.5 3.5 2.3 4.7 4.7 4.7 7 1.2-1.2 1.7-2.3 1.7-3.5C17.2 10.3 19 12.6 19 15a7 7 0 0 1-7 7z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M12 22a3.6 3.6 0 0 1-3.6-3.6c0-2.4 1.8-3.4 2.4-5.4 2.6 1.5 4.8 3 4.8 5.4A3.6 3.6 0 0 1 12 22z"
                          fill="currentColor"
                        />
                      </svg>
                      Ao vivo em vermelho
                    </li>
                  </ul>
                  <div className="mphone phone">
                    <img
                      src="/landing/v3/tela-explorar.webp"
                      alt=""
                      loading="lazy"
                      width="448"
                      height="976"
                    />
                  </div>
                </article>
                <article className="step" data-i="1" data-t="18:40">
                  <div className="clock">18:40</div>
                  <h3>Peça do seu jeito</h3>
                  <span className="q">Corinthians hoje com telão perto</span>
                  <p>
                    A busca com IA entende o pedido, procura só nas grades dos
                    bares e mostra de onde tirou cada resposta. Bar que ela não
                    achou não aparece.
                  </p>
                  <ul className="facts">
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M18.6 1.7Q19.3 4.7 22.3 5.4Q19.3 6.1 18.6 9.1Q17.9 6.1 14.9 5.4Q17.9 4.7 18.6 1.7Z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M10 5.4Q11.35 11.85 17.8 13.2Q11.35 14.55 10 21Q8.65 14.55 2.2 13.2Q8.65 11.85 10 5.4Z"
                          fill="currentColor"
                        />{' '}
                        <path
                          d="M19.2 15.1Q19.7 17.3 21.9 17.8Q19.7 18.3 19.2 20.5Q18.7 18.3 16.5 17.8Q18.7 17.3 19.2 15.1Z"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Entende time, dia e lugar
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 2.5h9.5L19 7v14.5H5z"
                          fill="currentColor"
                          opacity="0.35"
                        />{' '}
                        <path
                          d="M14.5 2.5V7H19zM8 11h8v2H8zM8 15h6v2H8z"
                          fill="currentColor"
                        />
                      </svg>
                      Mostra de onde tirou
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z"
                          fill="currentColor"
                        />
                      </svg>
                      Nada de bar inventado
                    </li>
                  </ul>
                  <div className="mphone phone">
                    <img
                      src="/landing/v3/tela-ia.webp"
                      alt=""
                      loading="lazy"
                      width="448"
                      height="976"
                    />
                  </div>
                </article>
                <article className="step" data-i="2" data-t="19:10">
                  <div className="clock">19:10</div>
                  <h3>Confira o bar antes de sair</h3>
                  <p>
                    Telão, som ligado, Premiere, área externa, oferta da casa e
                    quem já vai. O próprio bar informa, para aquele jogo.
                  </p>
                  <ul className="facts">
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <rect
                          x="2.5"
                          y="4"
                          width="19"
                          height="13"
                          rx="2.5"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <rect
                          x="8"
                          y="18.6"
                          width="8"
                          height="2.4"
                          rx="1.2"
                          fill="currentColor"
                        />{' '}
                        <path
                          d="M4.5 6.5h15v8h-15z"
                          fill="currentColor"
                          opacity="0.55"
                        />{' '}
                        <circle
                          cx="18"
                          cy="8.2"
                          r="1.7"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Telão, som, Premiere
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
                          fill="currentColor"
                        />{' '}
                        <circle
                          cx="7.4"
                          cy="5.6"
                          r="2.6"
                          fill="var(--spark,#e8320c)"
                        />{' '}
                        <circle
                          cx="11"
                          cy="4.6"
                          r="2.9"
                          fill="var(--spark,#e8320c)"
                        />{' '}
                        <circle
                          cx="14.2"
                          cy="5.8"
                          r="2.3"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Oferta da casa
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <g fill="currentColor" opacity="0.3">
                          {' '}
                          <circle cx="16.5" cy="8" r="3.4" />{' '}
                          <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />{' '}
                        </g>{' '}
                        <circle cx="9" cy="8" r="4" fill="currentColor" />{' '}
                        <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" />
                      </svg>
                      Quem já vai
                    </li>
                  </ul>
                  <div className="mphone phone">
                    <img
                      src="/landing/v3/tela-bar.webp"
                      alt=""
                      loading="lazy"
                      width="448"
                      height="976"
                    />
                  </div>
                </article>
                <article className="step" data-i="3" data-t="19:30">
                  <div className="clock">19:30</div>
                  <h3>Marque que vai</h3>
                  <p>
                    “Vou assistir aqui” avisa os amigos e conta para o bar. Não
                    é reserva de mesa: é você dizendo que vai estar lá.
                  </p>
                  <ul className="facts">
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <g fill="currentColor" opacity="0.3">
                          {' '}
                          <circle cx="16.5" cy="8" r="3.4" />{' '}
                          <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />{' '}
                        </g>{' '}
                        <circle cx="9" cy="8" r="4" fill="currentColor" />{' '}
                        <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" />
                      </svg>
                      Amigos veem que você vai
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 17V11a7 7 0 0 1 14 0v6l1.6 2H3.4z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M9.4 20a2.6 2.6 0 0 0 5.2 0z"
                          fill="currentColor"
                        />{' '}
                        <path d="M3.4 19 5 17h14l1.6 2z" fill="currentColor" />{' '}
                        <circle
                          cx="18"
                          cy="5.5"
                          r="3.2"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Lembrete 3 h antes
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <rect
                          x="3"
                          y="5"
                          width="18"
                          height="16"
                          rx="2.5"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10H3z"
                          fill="currentColor"
                        />{' '}
                        <rect
                          x="7"
                          y="2.5"
                          width="2.4"
                          height="5"
                          rx="1.2"
                          fill="currentColor"
                        />{' '}
                        <rect
                          x="14.6"
                          y="2.5"
                          width="2.4"
                          height="5"
                          rx="1.2"
                          fill="currentColor"
                        />{' '}
                        <rect
                          x="13"
                          y="13.5"
                          width="4.5"
                          height="4.5"
                          rx="1"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Vai para a sua agenda
                    </li>
                  </ul>
                  <div className="mphone phone">
                    <img
                      src="/landing/v3/tela-vou.webp"
                      alt=""
                      loading="lazy"
                      width="448"
                      height="976"
                    />
                  </div>
                </article>
                <article className="step" data-i="4" data-t="21:30">
                  <div className="clock">21:30</div>
                  <h3>Mostre o código no balcão</h3>
                  <p>
                    Nos bares Elite, o código libera a oferta da casa. O garçom
                    confere, a visita conta e a sua nota passa a valer.
                  </p>
                  <ul className="facts">
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z"
                          fill="currentColor"
                          opacity="0.25"
                        />{' '}
                        <path
                          d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z"
                          fill="currentColor"
                        />{' '}
                        <circle
                          cx="8.6"
                          cy="12"
                          r="2"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Código de 6 letras
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z"
                          fill="currentColor"
                          opacity="0.3"
                        />{' '}
                        <path
                          d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
                          fill="currentColor"
                        />{' '}
                        <circle
                          cx="7.4"
                          cy="5.6"
                          r="2.6"
                          fill="var(--spark,#e8320c)"
                        />{' '}
                        <circle
                          cx="11"
                          cy="4.6"
                          r="2.9"
                          fill="var(--spark,#e8320c)"
                        />{' '}
                        <circle
                          cx="14.2"
                          cy="5.8"
                          r="2.3"
                          fill="var(--spark,#e8320c)"
                        />
                      </svg>
                      Oferta liberada na hora
                    </li>
                    <li>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
                          fill="currentColor"
                        />
                      </svg>
                      Sua nota passa a valer
                    </li>
                  </ul>
                  <div className="mphone phone">
                    <img
                      src="/landing/v3/tela-codigo.webp"
                      alt=""
                      loading="lazy"
                      width="448"
                      height="976"
                    />
                  </div>
                </article>
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
                    <i className="on"></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>
                </div>
                <div className="phone">
                  <div className="screens" id="lp3-screens">
                    <img
                      className="on"
                      src="/landing/v3/tela-explorar.webp"
                      alt=""
                      width="448"
                      height="976"
                    />
                    <img
                      src="/landing/v3/tela-ia.webp"
                      alt=""
                      width="448"
                      height="976"
                      loading="lazy"
                    />
                    <img
                      src="/landing/v3/tela-bar.webp"
                      alt=""
                      width="448"
                      height="976"
                      loading="lazy"
                    />
                    <img
                      src="/landing/v3/tela-vou.webp"
                      alt=""
                      width="448"
                      height="976"
                      loading="lazy"
                    />
                    <img
                      src="/landing/v3/tela-codigo.webp"
                      alt=""
                      width="448"
                      height="976"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= BAR POR DENTRO ================= */}
        <section
          className="sec wrap"
          id="bar-por-dentro"
          aria-labelledby="h-anno"
        >
          <h2 id="h-anno" className="disp rv">
            O que o bar não conta no Instagram,{' '}
            <span className="h2-2">a Onside mostra.</span>
          </h2>
          <div className="anno" id="lp3-anno">
            <svg className="lines" id="lp3-lines" aria-hidden="true"></svg>
            <div className="col l">
              <div className="note rv" data-to="0">
                <span className="n">1</span>
                <b>Quem vai, pelo nome</b>
                <p>
                  34 pessoas vão. Amigos aparecem pelo nome; estranhos, nunca.
                </p>
              </div>
              <div className="note rv" data-to="1">
                <span className="n">2</span>
                <b>Está no bar? Faça check-in</b>
                <p>
                  A até 150 metros, no dia do jogo. Só quem esteve lá entra na
                  nota.
                </p>
              </div>
              <div className="note rv" data-to="2">
                <span className="n">3</span>
                <b>Telão e som, jogo por jogo</b>
                <p>
                  Telão, som ligado, Premiere, área externa. Marcado na partida,
                  não no perfil.
                </p>
              </div>
            </div>
            <div className="phone" id="lp3-annophone">
              <img
                src="/landing/v3/tela-bar2.webp"
                alt="Página do Bar do Zé no app: jogo de hoje, check-in, características, oferta da casa e próximos jogos"
                width="448"
                height="976"
                loading="lazy"
              />
              <span className="target" style={{ left: '86%', top: '17%' }}>
                <span>1</span>
              </span>
              <span className="target" style={{ left: '79%', top: '27.5%' }}>
                <span>2</span>
              </span>
              <span className="target" style={{ left: '50%', top: '38.5%' }}>
                <span>3</span>
              </span>
              <span className="target" style={{ left: '13%', top: '48.5%' }}>
                <span>4</span>
              </span>
              <span className="target" style={{ left: '22%', top: '67%' }}>
                <span>5</span>
              </span>
            </div>
            <div className="col r">
              <div className="note rv" data-to="3">
                <span className="n">4</span>
                <b>Oferta da casa</b>
                <p>
                  Chopp em dobro até o intervalo, liberado pelo código no
                  balcão.
                </p>
              </div>
              <div className="note rv" data-to="4">
                <span className="n">5</span>
                <b>A grade da semana</b>
                <p>
                  NBA às 22h, Brasileirão na terça, Fórmula 1 na quarta. Tudo no
                  mesmo lugar.
                </p>
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
            Futebol, NBA, NFL, UFC, Fórmula 1, tênis, vôlei e NBB.
          </p>
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
                <div className="sub">
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

        {/* ================= PARA BARES ================= */}
        <section className="pub" id="para-bares" aria-labelledby="h-pub">
          <div className="wrap sec">
            <div className="pub-head">
              <h2 id="h-pub" className="disp rv">
                Tem um bar?{' '}
                <span className="h2-2">Encha a casa em dia de jogo.</span>
              </h2>
              <div className="rv">
                <span className="tag">
                  <em>120 DIAS</em>de Elite grátis, sem cartão
                </span>
                <p
                  className="lede"
                  style={{ marginTop: '20px', color: '#3d3d38' }}
                >
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
        <section className="sec wrap" id="perguntas" aria-labelledby="h-faq">
          <div className="faq-grid">
            <h2
              id="h-faq"
              className="disp rv"
              style={{ fontSize: 'clamp(46px,5.4vw,84px)' }}
            >
              Antes de sair de casa,{' '}
              <span className="h2-2">tire a dúvida.</span>
            </h2>
            <div className="faq">
              <details open>
                <summary>
                  É de graça para torcedor?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  Sim. Quem paga plano é o bar. Para você, buscar, marcar
                  presença e ganhar medalha não custa nada.
                </p>
              </details>
              <details>
                <summary>
                  Como sei que o bar vai mesmo passar o jogo?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  A grade é publicada pelo próprio bar, partida por partida,
                  dizendo se tem telão e se o som fica ligado. Quem foi avalia
                  depois, e a nota mostra se o bar cumpriu.
                </p>
              </details>
              <details>
                <summary>
                  Dá para reservar mesa?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  Não. “Vou assistir aqui” marca presença e, nos bares Elite,
                  gera o código do balcão. Mesa continua sendo direto com o bar.
                </p>
              </details>
              <details>
                <summary>
                  Só futebol?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  Não. NBA, NFL, UFC, Fórmula 1, tênis, vôlei e NBB também. Você
                  segue os seus times e atletas e vê onde passa cada um.
                </p>
              </details>
              <details>
                <summary>
                  Meus amigos veem onde eu fui?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  Só se você deixar. Em Privacidade você escolhe se todos, só
                  amigos ou ninguém vê os bares e jogos. Quem não é seu amigo
                  nunca vê o seu nome.
                </p>
              </details>
              <details>
                <summary>
                  Preciso baixar o app?
                  <span className="pm" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      style={{ color: '#12120f' }}
                    >
                      <path
                        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </summary>
                <p>
                  Não. Tudo funciona aqui no site, no celular ou no computador:
                  buscar o jogo, marcar que vai, o código do balcão e a
                  avaliação. O app para iPhone está chegando, com a mesma conta.
                </p>
              </details>
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
            <h2 id="h-final" className="disp rv">
              O jogo
              <br />é <span className="r">aqui.</span>
            </h2>
            <p className="lede rv">
              A grade de hoje já está na Onside, com os bares perto de você. Sem
              baixar nada.
            </p>
            <div
              className="rv"
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: '34px'
              }}
            >
              <a
                className="btn btn-acid"
                style={{ height: '62px', padding: '0 32px', fontSize: '18px' }}
                href={cta.href}
                data-cta={`final_${cta.kind}`}
              >
                Ver os jogos de hoje
              </a>
              {!cta.session && (
                <a
                  className="btn btn-ghost"
                  style={{ height: '62px', color: 'var(--paper)' }}
                  href="/login"
                >
                  Já tenho conta
                </a>
              )}
            </div>
            <p className="alt">
              Tem um bar?{' '}
              <a
                href={BAR_SIGNUP_HREF}
                data-cta="final_pub_signup"
                style={{ color: 'var(--paper)', fontWeight: '700' }}
              >
                Comece com 120 dias de Elite
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <a
            className="logo"
            href="#top"
            aria-label="Onside, início"
            style={{ color: 'var(--paper)' }}
          >
            <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
              <circle
                cx="14"
                cy="14"
                r="10.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="4.2"
              />
              <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
            </svg>
            <b style={{ fontSize: '22px' }}>
              ONSIDE<i></i>
            </b>
          </a>
          <nav aria-label="Rodapé">
            <a href="/login">Entrar</a>
            <a href="/signup">Criar conta</a>
            <a href={BAR_SIGNUP_HREF} data-cta="footer_pub_signup">
              Cadastre seu bar
            </a>
            <a href="/guia">Guia</a>
            <a href="mailto:contato@onside.sh">Contato</a>
            <a href="/termos">Termos</a>
            <a href="/privacidade">Privacidade</a>
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {social.label}
              </a>
            ))}
            <CookiePreferencesButton className="ck" />
          </nav>
          <span className="mono" style={{ fontSize: '13px' }}>
            Feito em São Paulo · onside.sh
          </span>
        </div>
      </footer>
    </div>
  )
}
