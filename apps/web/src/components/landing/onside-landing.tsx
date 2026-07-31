import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useTRPC } from '../../utils/trpc'
import { OnsideAppDemo } from './onside-app-demo'
import { OnsideWaitlist } from './onside-waitlist'

const TICKER_FALLBACK = [
  'AO VIVO · FLAMENGO X PALMEIRAS · BAR DO ZÉ · PINHEIROS',
  'HOJE 21:30 · NBA FINALS · SPORTS CENTRAL · VILA MADALENA',
  'AMANHÃ 16:00 · CHAMPIONS · THE RED LION · ITAIM',
  'SÁB 22:00 · UFC 305 · OCTAGON PUB · CONSOLAÇÃO',
  'DOM 14:00 · GP DE INTERLAGOS · PUB THE BOX · MOEMA'
]

const STEPS = [
  {
    number: '01',
    title: 'Diga o jogo',
    body: 'Time, campeonato ou esporte. Do clássico estadual à luta de sábado.'
  },
  {
    number: '02',
    title: 'Veja quem passa',
    body: 'Bares próximos com a transmissão confirmada, ordenados por distância e horário.'
  },
  {
    number: '03',
    title: 'Chegue no clima',
    body: 'Lotação, torcida predominante, telões e reserva antes de sair de casa.'
  }
]

const DETAILS = [
  'A partida exata na grade da casa — não “passa futebol”',
  'Lotação atualizada pelo próprio bar e por quem já está lá',
  'Som no jogo ou música: você escolhe o ambiente',
  'Torcida predominante, para saber onde senta',
  'Quantidade e tamanho dos telões',
  'Reserva de mesa para a galera antes do apito'
]

const FAQ_ITEMS = [
  {
    question: 'É de graça?',
    answer:
      'Para o torcedor, sim: buscar, ver a grade e a lotação não custa nada. Bares têm plano à parte.'
  },
  {
    question: 'Como sei que o jogo passa mesmo?',
    answer:
      'A casa mantém a própria grade e quem está no bar confirma. Quando não há confirmação, a gente diz que não há — em vez de arriscar seu sábado.'
  },
  {
    question: 'Só futebol?',
    answer:
      'Não. Futebol puxa a fila, mas basquete, vôlei, luta e corrida estão no mesmo lugar.'
  },
  {
    question: 'Só no Brasil?',
    answer:
      'Começa no Brasil e o app já nasce em português e inglês. A ordem das cidades segue a demanda de cadastros.'
  },
  {
    question: 'Tenho um bar. O que preciso fazer?',
    answer:
      'Cadastrar a casa, publicar a grade da semana e manter a lotação em dia. Leva menos tempo que imprimir cartaz.'
  }
]

function BrandMark({ footer = false }: { footer?: boolean }) {
  return (
    <span className={`onside-mark ${footer ? 'is-footer' : ''}`}>
      <span />
    </span>
  )
}

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <span className="onside-brand">
      <BrandMark footer={footer} />
      <span>
        Onside<i>.</i>
      </span>
    </span>
  )
}

function Navbar() {
  return (
    <nav className="onside-nav" aria-label="Navegação principal">
      <div className="onside-shell onside-nav-inner">
        <a href="#top" aria-label="Onside — início">
          <Brand />
        </a>
        <div className="onside-nav-links">
          <a href="#como">Como funciona</a>
          <a href="#bares">Para bares</a>
          <a href="#faq">Dúvidas</a>
          <a className="onside-nav-cta" href="#cta">
            Entrar na lista
          </a>
        </div>
      </div>
    </nav>
  )
}

function formatTickerEvent(event: Record<string, unknown>) {
  const startsAt = new Date(String(event.starts_at ?? ''))
  const time = startsAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  const sport = String(event.sport_name ?? 'Esporte').toUpperCase()
  const championship = String(event.championship ?? 'Partida').toUpperCase()
  const bar = String(event.bar_name ?? 'Bar parceiro').toUpperCase()
  return `${sport} · ${championship} · ${bar} · ${time}`
}

function LiveTicker() {
  const trpc = useTRPC()
  const [isPaused, setIsPaused] = useState(false)
  const { data: eliteEvents = [] } = useQuery(
    trpc.pubs.getEliteEvents.queryOptions()
  )
  const items =
    eliteEvents.length > 0
      ? eliteEvents.map((event) => formatTickerEvent(event))
      : TICKER_FALLBACK
  const loop = items.flatMap((item) => [
    { id: `${item}-first`, label: item },
    { id: `${item}-second`, label: item }
  ])

  return (
    <section
      className={`onside-ticker ${isPaused ? 'is-paused' : ''}`}
      aria-label="Transmissões em destaque"
    >
      <button
        className="onside-ticker-control"
        type="button"
        aria-pressed={isPaused}
        onClick={() => setIsPaused((current) => !current)}
      >
        {isPaused ? 'Retomar' : 'Pausar'}
      </button>
      <div className="onside-ticker-track">
        {loop.map((item) => (
          <span key={item.id}>
            <i />
            {item.label}
          </span>
        ))}
      </div>
    </section>
  )
}

function Hero() {
  const marks = [
    ['Onde', 'Bares que confirmam a grade, não adivinham'],
    ['Quando', 'Do apito inicial ao último round'],
    ['Custo', 'Grátis para quem torce']
  ]
  const stats = [
    ['Distância', '1,2 km'],
    ['Lotação', '80%'],
    ['Som', 'Narração ligada']
  ]

  return (
    <header id="top" className="onside-shell onside-hero">
      <div className="onside-hero-copy">
        <p className="onside-eyebrow">
          <i />
          Transmissões ao vivo perto de você
        </p>
        <h1>
          O jogo
          <br />
          <span>é aqui.</span>
        </h1>
        <p className="onside-hero-lead">
          Onside mostra qual bar está passando a sua partida agora — com
          lotação, som ligado, telão e a torcida que está lá. Escolha a mesa,
          não o sofá.
        </p>
        <div className="onside-hero-action">
          <a href="#cta">Entrar na lista</a>
          <span>Lançamento em breve · vagas por cidade</span>
        </div>
        <div className="onside-marks">
          {marks.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="onside-hero-media">
        {/* biome-ignore lint/performance/noImgElement: TanStack Start does not provide a built-in optimized image component. */}
        <img
          src="/hero-bar.jpg"
          alt="Bar cheio de torcedores assistindo a uma partida em vários telões"
          width={1280}
          height={1024}
        />
        <span className="onside-hero-shade" />
        <div className="onside-live-card">
          <p>
            <i />
            Ao vivo agora
          </p>
          <strong>Flamengo 2 × 2 Palmeiras</strong>
          <div>
            {stats.map(([label, value]) => (
              <span key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

function HowItWorks() {
  return (
    <section id="como" className="onside-shell onside-how">
      <div className="onside-section-heading">
        <h2>Do sofá à mesa em três toques.</h2>
        <span>Três passos</span>
      </div>
      <div className="onside-steps">
        {STEPS.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProductDemo() {
  return (
    <section className="onside-product">
      <div className="onside-shell onside-product-inner">
        <div>
          <p className="onside-section-label">
            O que você sabe antes de sair · teste o app aqui
          </p>
          <h2>Nenhuma surpresa ao chegar no bar.</h2>
          <ul>
            {DETAILS.map((detail) => (
              <li key={detail}>
                <i />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="onside-demo-wrap">
          <OnsideAppDemo />
        </div>
      </div>
    </section>
  )
}

function ForBars() {
  return (
    <section id="bares" className="onside-shell onside-bars">
      <div>
        <p className="onside-section-label">Para bares e pubs</p>
        <h2>Sua grade vira motivo pra sair de casa.</h2>
        <p>
          Publique as transmissões da semana e apareça exatamente para quem
          procura aquela partida, naquele raio. O painel do bar continua no
          navegador — o torcedor fica no app.
        </p>
      </div>
      <div>
        <a href="#cta">Cadastrar meu bar</a>
        <span>Cadastro gratuito no lançamento</span>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section id="cta" className="onside-cta">
      <div className="onside-shell onside-cta-inner">
        <div className="onside-cta-copy">
          <p className="onside-section-label">Lista de espera</p>
          <h2>Entre antes do apito</h2>
          <p>
            Sem spam: um e-mail quando o app abrir na sua cidade. Nada mais.
          </p>
        </div>
        <OnsideWaitlist />
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="onside-shell onside-faq">
      <div className="onside-section-heading">
        <h2>Perguntas diretas.</h2>
        <span>Dúvidas frequentes</span>
      </div>
      <div className="onside-faq-list">
        {FAQ_ITEMS.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="onside-footer">
      <div className="onside-shell onside-footer-inner">
        <Brand footer />
        <span className="onside-footer-note">
          © 2026 Onside · feito por quem assiste em bar
        </span>
        <div>
          <a href="https://www.instagram.com/" rel="noreferrer">
            Instagram
          </a>
          <a href="https://x.com/" rel="noreferrer">
            X
          </a>
          <a href="mailto:contato@findsports.com.br">Contato</a>
        </div>
      </div>
    </footer>
  )
}

export function OnsideLanding() {
  return (
    <div className="onside-page">
      <a className="onside-skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Navbar />
      <LiveTicker />
      <main id="conteudo">
        <Hero />
        <HowItWorks />
        <ProductDemo />
        <ForBars />
        <FinalCta />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
