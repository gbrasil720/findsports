import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { ATTENDANCE_DISPLAY_FLOOR } from '@findsports_oficial/api/lib/attendance-floor'
import { resolveEventScreen } from '@findsports_oficial/api/lib/event-screen'
import {
  groupOpeningHours,
  isOpenNow
} from '@findsports_oficial/api/lib/opening-hours'
import {
  type RatingReasonId,
  reasonLabel
} from '@findsports_oficial/api/lib/rating-reasons'
import { gameTitle, matchSides } from '@findsports_oficial/db/game-title'
import { normalizeHouseOffer } from '@findsports_oficial/db/house-offer'
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { Chip } from '@/components/painel'
import {
  compareEventStartsAscending,
  getEventTemporalState
} from '@/domain/events'
import { juntarEndereco } from '@/lib/cep'
import type { AdminEvent } from './admin-model'
import {
  diaDoJogo,
  diaNaLista,
  horaDoJogo,
  horarioDoRascunho,
  iniciaisDoApp,
  quandoNaGota,
  type Rascunho,
  siglaDoTime
} from './espaco-model'
import { IconeDoApp, type IconeDoAppNome } from './icone-do-app'
import './espaco-previa.css'

const PAPER = '#f1eee6'
const INK = '#12120f'
const ACID = '#c9f135'
const LIVE = '#e8320c'

type Props = {
  rascunho: Rascunho
  photoUrl: string | null
  /** Elite em dia: selo e oferta da casa, como o torcedor vê. */
  elite: boolean
  /** Jogos do bar; `null` enquanto carregam. */
  events: AdminEvent[] | null
  /** A nota pública (acima do piso); `null` quando não aparece. */
  nota: { percentage: number; total: number } | null
  /** "O que pesou?" (WEB-398), o resumo que a página mostra. */
  motivos: {
    positive: RatingReasonId[]
    negative: RatingReasonId[]
  } | null
  /** Gasto médio, já com o plano que o mostra (Pro ou Elite). */
  gastoCents: number | null
  /** O bar tem coordenadas: "Onde fica" aparece. */
  localizado: boolean
  /**
   * Quantos marcaram "Vou assistir aqui" em cada jogo (`barReservations.going`).
   * Só o Elite recebe a contagem; `null` nos outros planos ou carregando.
   */
  presencas: Record<string, number> | null
  now: Date
}

/** O que as três prévias dividem, contado uma vez. */
type Visto = Props & {
  nome: string
  /** Os jogos que ainda não acabaram, do mais cedo (os do `pubs.getById`). */
  jogos: AdminEvent[]
  /** O primeiro deles está rolando agora. */
  aoVivo: boolean
}

const ABAS = [
  ['pagina', 'Página'],
  ['card', 'Card'],
  ['mapa', 'Mapa']
] as const
type Aba = (typeof ABAS)[number][0]

/** A largura do iPhone 16e, a do design: tudo é desenhado nela e encolhido. */
const LARGURA = 390

/**
 * "Como o torcedor vê": a página do bar no app (`app/bar/[id].tsx`), o card
 * da lista do Explorar e a gota do mapa, montados do rascunho com as medidas,
 * cores e ícones do app, e no tema do sistema, como ele. Não agem: são só
 * desenho. Fica de fora o que o painel não tem como saber: a distância, as
 * iniciais e os amigos de quem vai, e se o torcedor já marcou ("Vou", "Você
 * vai"). "N vão" só no Elite, a partir do piso, como o torcedor vê.
 */
export function EspacoPrevia(props: Props) {
  const [aba, setAba] = useState<Aba>('pagina')
  const jogos = (props.events ?? [])
    .filter(
      (e) => getEventTemporalState(e.startsAt, e.endsAt, props.now) !== 'past'
    )
    .sort(compareEventStartsAscending)
  const proximo = jogos[0]
  const visto: Visto = {
    ...props,
    nome: props.rascunho.name.trim() || 'Seu bar',
    jogos,
    aoVivo: proximo
      ? getEventTemporalState(proximo.startsAt, proximo.endsAt, props.now) ===
        'live'
      : false
  }
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-[15px]">Como o torcedor vê</h2>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Prévia</legend>
          {ABAS.map(([id, rotulo]) => (
            <Chip
              key={id}
              ativo={aba === id}
              check={false}
              onClick={() => setAba(id)}
            >
              {rotulo}
            </Chip>
          ))}
        </fieldset>
      </div>
      {aba === 'pagina' ? (
        <TelaDoApp {...visto} />
      ) : aba === 'card' ? (
        <Moldura rotulo={`Prévia do card de ${visto.nome} na lista do app`}>
          <div className="px-4 pt-5 pb-6">
            <Ingresso {...visto} />
          </div>
        </Moldura>
      ) : (
        <MapaDoApp {...visto} />
      )}
      <p className="max-w-[300px] text-center text-[12.5px] text-[var(--painel-muted)]">
        Atualiza enquanto você edita. O que não estiver salvo aparece só aqui.
      </p>
    </div>
  )
}

/**
 * O aparelho em volta da prévia. Dentro, o desenho a 390 pt, encolhido pelo
 * `zoom` até a largura que sobra (o `zoom`, ao contrário do `transform`,
 * encolhe também o espaço que ele ocupa, e a página rola por dentro).
 * `altura`: a tela inteira do aparelho (844 pt), senão a do conteúdo.
 */
function Moldura({
  rotulo,
  altura,
  rola,
  fixos,
  children
}: {
  rotulo: string
  altura?: number
  /** A página rola: a moldura não pode ser `inert`. */
  rola?: boolean
  /** O que fica parado sobre a página que rola (botões, "Vou assistir"). */
  fixos?: ReactNode
  children: ReactNode
}) {
  const tela = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(320 / LARGURA)
  useLayoutEffect(() => {
    const el = tela.current
    if (!el) return
    const medir = () => setZoom(el.clientWidth / LARGURA)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  return (
    <div
      inert={!rola}
      {...(rola ? {} : { role: 'img', 'aria-label': rotulo })}
      className="w-full max-w-[340px] rounded-[34px] bg-black p-2.5 shadow-[0_30px_50px_-25px_rgb(18_18_15/60%)]"
    >
      <div
        ref={tela}
        className="previa-app overflow-hidden rounded-[26px]"
        style={altura ? { aspectRatio: `${LARGURA} / ${altura}` } : undefined}
      >
        {rola ? (
          // A região é a tela inteira: a página que rola e o que fica fixo
          // sobre ela ("Vou assistir aqui").
          <section
            aria-label={rotulo}
            className="previa-tela relative"
            style={{ zoom, width: LARGURA, height: altura }}
          >
            <div
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a prévia rola pelo teclado
              tabIndex={0}
              className="previa-rola absolute inset-0 overflow-y-auto outline-none"
            >
              {children}
            </div>
            {fixos}
          </section>
        ) : (
          <div
            className="previa-tela relative"
            style={{ zoom, width: LARGURA, height: altura }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Peças do app (`components/card.tsx`, `explore.tsx`, `ui.tsx`) ─── */

/** `text()` do app: Archivo no peso e na altura de linha dados. */
const texto = (
  tamanho: number,
  peso: 400 | 600 | 700 = 400,
  linha = 1.4
): CSSProperties => ({
  fontSize: tamanho,
  fontWeight: peso,
  lineHeight: linha
})

/**
 * Texto que encolhe até caber, em vez de cortar no meio da palavra: o
 * `adjustsFontSizeToFit` do app (nome do bar em duas linhas, até 60%; nome
 * do time numa linha, até 75%). Mede depois de desenhar e de as fontes
 * chegarem.
 */
function Encolhe({
  tamanho,
  minimo = 0.6,
  className,
  style,
  children
}: {
  tamanho: number
  minimo?: number
  className: string
  style?: CSSProperties
  children: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [atual, setAtual] = useState(tamanho)
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo quando o texto muda
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let vivo = true
    const encaixar = () => {
      if (!vivo) return
      let t = tamanho
      el.style.fontSize = `${t}px`
      el.style.overflowWrap = ''
      const sobra = () =>
        el.scrollWidth > el.clientWidth + 0.5 ||
        el.scrollHeight > el.clientHeight + 0.5
      while (t > tamanho * minimo && sobra()) {
        t = Math.max(tamanho * minimo, t - 0.5)
        el.style.fontSize = `${t}px`
      }
      // Palavra que nem no mínimo cabe quebra onde for, como no iOS.
      if (el.scrollWidth > el.clientWidth + 0.5)
        el.style.overflowWrap = 'anywhere'
      setAtual(t)
    }
    encaixar()
    document.fonts?.ready.then(encaixar)
    return () => {
      vivo = false
    }
  }, [tamanho, minimo, children])
  return (
    <span ref={ref} className={className} style={{ ...style, fontSize: atual }}>
      {children}
    </span>
  )
}

/** Sombra dura deslocada (`HardShadow`). */
function SombraDura({ cor, desvio }: { cor: string; desvio: number }) {
  return (
    <span
      className="absolute rounded-[6px]"
      style={{
        top: desvio,
        left: desvio,
        right: -desvio,
        bottom: -desvio,
        background: cor
      }}
    />
  )
}

/** O `Card` do app: fundo, contorno de 1 pt e sombra dura; `soft` soma a longa. */
function Cartao({
  sombra = 'var(--a-shadow)',
  desvio = 4,
  soft,
  className,
  style,
  children
}: {
  sombra?: string
  desvio?: number
  soft?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      {soft ? (
        <span className="absolute inset-0 rounded-[6px] bg-[var(--a-card)] shadow-[0_14px_34px_rgb(18_18_15/30%)]" />
      ) : null}
      <SombraDura cor={sombra} desvio={desvio} />
      <div
        className="relative h-full overflow-hidden rounded-[6px] border border-[var(--a-ring)] bg-[var(--a-card)]"
        style={style}
      >
        {children}
      </div>
    </div>
  )
}

/** Selo de vidro sobre foto (`PhotoPill`): "Ao vivo", "Elite", "87% voltariam". */
function Pilula({
  tom,
  altura = 30,
  children
}: {
  tom: 'live' | 'acid' | 'dark'
  altura?: number
  children: ReactNode
}) {
  const fundo = {
    live: 'rgb(232 50 12 / 78%)',
    acid: 'rgb(201 241 53 / 82%)',
    dark: 'rgb(36 36 32 / 40%)'
  }[tom]
  return (
    <span
      className="previa-vidro flex items-center gap-1.5 px-[11px]"
      style={{ height: altura, borderRadius: altura / 2, background: fundo }}
    >
      {children}
    </span>
  )
}

/** Botão redondo de vidro escuro sobre a foto (voltar, compartilhar, coração). */
function Redondo({
  tamanho,
  children
}: {
  tamanho: number
  children: ReactNode
}) {
  return (
    <span
      className="previa-vidro grid place-items-center rounded-full"
      style={{
        width: tamanho,
        height: tamanho,
        background: 'rgb(36 36 32 / 40%)'
      }}
    >
      {children}
    </span>
  )
}

/** Time contra time com a hora no meio (`MatchRow`). */
function LinhaDoJogo({ jogo, aoVivo }: { jogo: AdminEvent; aoVivo: boolean }) {
  const lados = matchSides(jogo)
  const titulo = gameTitle(jogo)
  const meio = (
    <span className="flex max-w-28 flex-none flex-col items-center">
      <span
        className="previa-anton my-[-6px] text-[22px]"
        style={{ color: aoVivo ? 'var(--a-live)' : 'var(--a-ink)' }}
      >
        {aoVivo ? 'AO VIVO' : horaDoJogo(jogo.startsAt)}
      </span>
      {lados || titulo !== jogo.championship ? (
        <span className="previa-mono mt-0.5 max-w-full truncate text-[10.5px] text-[var(--a-muted)]">
          {jogo.championship}
        </span>
      ) : null}
    </span>
  )
  if (!lados) {
    return (
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <b className="line-clamp-2 flex-1" style={texto(14, 700, 1.15)}>
          {titulo}
        </b>
        {meio}
      </div>
    )
  }
  const time = (nome: string, direita?: boolean) => (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${direita ? 'flex-row-reverse text-right' : ''}`}
    >
      <span className="grid size-10 flex-none place-items-center rounded-full border-2 border-[var(--a-mark-ring)] bg-[var(--a-mark)]">
        <span className="previa-anton my-[-4px] text-[15px] tracking-[0.3px]">
          {siglaDoTime(nome)}
        </span>
      </span>
      <Encolhe
        tamanho={14}
        minimo={0.75}
        className="block truncate font-bold leading-[1.15]"
      >
        {nome}
      </Encolhe>
    </span>
  )
  return (
    <div className="flex items-center gap-2 px-3.5 pt-3">
      {time(lados[0])}
      {meio}
      {time(lados[1], true)}
    </div>
  )
}

/** O picote entre o jogo e o bar (`Perforation`), com os furos na cor da folha. */
function Picote() {
  return (
    <div className="relative flex h-[18px] items-center">
      <span className="absolute -left-[9px] size-[18px] rounded-full bg-[var(--a-sheet)]" />
      <svg className="mx-3.5 h-0.5 flex-1" aria-hidden="true">
        <line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          style={{ stroke: 'var(--a-dash)' }}
          strokeWidth="1.5"
          strokeDasharray="4.5 4.5"
        />
      </svg>
      <span className="absolute -right-[9px] size-[18px] rounded-full bg-[var(--a-sheet)]" />
    </div>
  )
}

/** As características que viram ícone no ingresso (`AMENITY_ICONS`). */
const ICONES_DO_INGRESSO: [number, IconeDoAppNome][] = [
  [1, 'tv'],
  [2, 'sound'],
  [4, 'outdoor']
]

/**
 * O ingresso do bar (`BarTicket`): foto com os selos, o jogo, o picote e o
 * bar. A sombra muda com o estado: vermelha ao vivo, acid no Elite.
 */
function Ingresso({
  rascunho,
  photoUrl,
  elite,
  nota,
  presencas,
  now,
  nome,
  jogos,
  aoVivo
}: Visto) {
  const jogo = jogos[0]
  // "34 vão" (`Going` do app), do piso para cima; sem as iniciais, que no app
  // são de quem marcou por último, e o ícone toma o lugar delas.
  const vao = jogo ? (presencas?.[jogo.id] ?? 0) : 0
  const [sombra, desvio] = aoVivo
    ? ['var(--a-live-shadow)', 5]
    : elite
      ? ['rgb(201 241 53 / 85%)', 5]
      : ['var(--a-shadow)', 4]
  const icones = ICONES_DO_INGRESSO.filter(([id]) =>
    rascunho.amenities.includes(id)
  )
  return (
    <div className="relative">
      <SombraDura cor={sombra} desvio={desvio} />
      <div className="relative overflow-hidden rounded-[6px] border border-[var(--a-ring)] bg-[var(--a-card)]">
        <div className="relative grid h-32 place-items-center bg-[#2a2a25]">
          {/* As iniciais ficam por baixo e a foto cobre: foto quebrada
              mostra as iniciais, como no app. */}
          <span
            className="text-[rgb(241_238_230/22%)]"
            style={texto(34, 700, 1.2)}
          >
            {iniciaisDoApp(nome)}
          </span>
          {photoUrl ? (
            <div
              className="absolute inset-0 bg-center bg-cover"
              style={{ backgroundImage: `url("${photoUrl}")` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_18_15/0%)_40%,rgb(18_18_15/55%))]" />
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            {aoVivo ? (
              <Pilula tom="live">
                <span className="size-[7px] rounded-full bg-[#f1eee6]" />
                <b className="text-[#12120f]" style={texto(12.5, 700, 1.2)}>
                  Ao vivo
                </b>
              </Pilula>
            ) : jogo ? (
              <Pilula tom="dark">
                <span className="previa-mono text-[#f1eee6] text-[12px]">
                  {diaDoJogo(jogo.startsAt, now)} às {horaDoJogo(jogo.startsAt)}
                </span>
              </Pilula>
            ) : null}
            {elite ? (
              <Pilula tom="acid">
                <IconeDoApp nome="medal" tamanho={14} cor={INK} />
                <b className="text-[#12120f]" style={texto(12.5, 700, 1.2)}>
                  Elite
                </b>
              </Pilula>
            ) : null}
          </div>
          <span className="absolute top-2 right-2">
            <Redondo tamanho={36}>
              <IconeDoApp nome="fan" tamanho={18} cor={PAPER} />
            </Redondo>
          </span>
        </div>
        {jogo ? (
          <>
            <LinhaDoJogo jogo={jogo} aoVivo={aoVivo} />
            <Picote />
          </>
        ) : (
          <div className="h-3" />
        )}
        <div className="flex items-center gap-2.5 px-3.5 pb-[13px]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[7px]">
              <b
                className="truncate tracking-[-0.17px]"
                style={texto(17, 700, 1.2)}
              >
                {nome}
              </b>
              {nota ? (
                <span
                  className="shrink-0 rounded-[3px] bg-[#c9f135] px-1.5 py-[3px] text-[#12120f]"
                  style={texto(10.5, 700, 1.2)}
                >
                  {nota.percentage}% voltariam
                </span>
              ) : null}
            </div>
            <div className="mt-[3px] flex items-center gap-2">
              <span
                className="truncate text-[var(--a-muted)]"
                style={texto(12.5, 400, 1.3)}
              >
                {rascunho.neighborhood.trim()}
              </span>
              {icones.length ? (
                <span className="flex flex-none gap-1.5">
                  {icones.map(([id, icone]) => (
                    <IconeDoApp
                      key={id}
                      nome={icone}
                      tamanho={15}
                      cor="var(--a-muted)"
                    />
                  ))}
                </span>
              ) : null}
            </div>
          </div>
          {vao >= ATTENDANCE_DISPLAY_FLOOR ? (
            <span className="flex flex-none items-center gap-[5px]">
              <IconeDoApp nome="people" tamanho={17} cor="var(--a-ink)" />
              <span style={texto(12.5, 600, 1.2)}>
                {vao.toLocaleString('pt-BR')} vão
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * A gota do bar tocado (`MapDrop` com balão, 21a): tinta com copo; vermelha
 * com telão e halo se ao vivo; acid com estrela se Elite. A ponta fica no
 * fim da caixa (`tipY` = 105 pt), centrada.
 */
function Gota({
  nome,
  quando,
  aoVivo,
  elite
}: {
  nome: string
  quando: string | null
  aoVivo: boolean
  elite: boolean
}) {
  const cor = aoVivo ? LIVE : elite ? ACID : INK
  const icone: [IconeDoAppNome, string, string] = aoVivo
    ? ['tv', PAPER, PAPER]
    : elite
      ? ['star', INK, INK]
      : ['bar', PAPER, ACID]
  return (
    <div className="flex max-w-full flex-col items-center">
      <div className="flex max-w-full flex-col items-center gap-0.5 rounded-[12px] bg-[#12120f] px-[11px] py-[7px] text-center shadow-[3px_4px_0_#c9f135]">
        <b className="text-[#f1eee6]" style={texto(13, 700, 1.25)}>
          {nome}
        </b>
        {quando ? (
          <span className="previa-mono text-[#c9f135] text-[11px]">
            {quando}
          </span>
        ) : null}
      </div>
      {/* 8 pt entre o balão e a gota, como em `dropBox`. */}
      <div className="relative mt-2 h-[51px] w-10">
        {aoVivo ? (
          <span className="absolute top-[38.4px] left-[1.4px] size-[37.2px] rounded-full border-[6px] border-[rgb(232_50_12/10%)] bg-[rgb(232_50_12/20%)]" />
        ) : null}
        <span
          className="absolute inset-x-0 top-0 h-10 -rotate-45 rounded-[20px_20px_20px_3px] border-[2.5px] border-[var(--a-drop-ring)] shadow-[3px_-1px_0_rgb(18_18_15/22%)]"
          style={{ background: cor }}
        />
        <span className="absolute inset-x-0 top-0 grid h-10 place-items-center">
          <IconeDoApp
            nome={icone[0]}
            tamanho={20}
            cor={icone[1]}
            acento={icone[2]}
          />
        </span>
      </div>
    </div>
  )
}

/** O fundo do mapa: o painel não desenha o mapa de verdade. */
const LISTRAS: CSSProperties = {
  background:
    'repeating-linear-gradient(135deg, var(--a-map-1) 0 8px, var(--a-map-2) 8px 16px)'
}

/** A gota tocada sobre o mapa do Explorar. */
function MapaDoApp({ nome, elite, now, jogos, aoVivo }: Visto) {
  return (
    <Moldura rotulo={`Prévia do pino de ${nome} no mapa do app`}>
      <div className="grid h-[512px] place-items-center px-4" style={LISTRAS}>
        <Gota
          nome={nome}
          quando={quandoNaGota(jogos[0] ?? null, aoVivo, now)}
          aoVivo={aoVivo}
          elite={elite}
        />
      </div>
    </Moldura>
  )
}

/* ─── A página do bar ─── */

/** As características que o app desenha em ladrilho, com ícone. */
const LADRILHOS: { id: number; icone: IconeDoAppNome; rotulo: string }[] = [
  { id: 1, icone: 'tv', rotulo: 'Telão' },
  { id: 2, icone: 'sound', rotulo: 'Som ligado' },
  { id: 3, icone: 'premiere', rotulo: 'Premiere' },
  { id: 4, icone: 'outdoor', rotulo: 'Área externa' }
]

/** Quantos próximos jogos a página lista: três, como o app. */
const MAIS_JOGOS = 3
const SEMANA_MS = 7 * 86_400_000

/** O título de seção, com o número à direita ("5 esta semana"). */
function Titulo({ titulo, aside }: { titulo: string; aside?: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2.5">
      <b style={texto(16, 700)}>{titulo}</b>
      {aside ? (
        <span className="text-[var(--a-muted)]" style={texto(12.5)}>
          {aside}
        </span>
      ) : null}
    </div>
  )
}

/** Etiqueta cinza (`Label` da lista de jogos, chips de "O que tem"). */
function Etiqueta({
  children,
  style
}: {
  children: ReactNode
  style: CSSProperties
}) {
  return (
    <span className="rounded-[3px] bg-[var(--a-mark)]" style={style}>
      {children}
    </span>
  )
}

/** Linhas de um cartão separadas por um fio, como as listas do app. */
const linhaComFio = (indice: number) =>
  indice > 0 ? 'border-t border-[var(--a-line)]' : ''

function TelaDoApp(visto: Visto) {
  const {
    rascunho,
    photoUrl,
    elite,
    nota,
    motivos,
    gastoCents,
    localizado,
    now,
    nome,
    jogos,
    aoVivo
  } = visto
  const agora = now.getTime()
  const proximo = jogos[0]
  const info = [
    rascunho.neighborhood.trim(),
    gastoCents
      ? `R$ ${Math.round(gastoCents / 100)} por pessoa, informado pelo bar`
      : null
  ].filter(Boolean)
  const ladrilhos = LADRILHOS.filter((l) => rascunho.amenities.includes(l.id))
  const caracteristicas = AMENITIES.filter((item) =>
    rascunho.amenities.includes(item.id)
  ).flatMap((item) => {
    const rotulo = item.id === 3 ? 'Premiere' : item.label
    // O número de telas entra logo depois do telão, como no app.
    return item.id === 1 && rascunho.screenCount && rascunho.screenCount > 1
      ? [rotulo, `${rascunho.screenCount} telas`]
      : [rotulo]
  })
  const oferta = elite ? normalizeHouseOffer(rascunho.houseOffer) : null
  const semana = jogos.filter(
    (jogo) => new Date(jogo.startsAt).getTime() < agora + SEMANA_MS
  ).length
  const horario = horarioDoRascunho(rascunho.hours)
  const aberto = isOpenNow(horario, now)
  const endereco = juntarEndereco(rascunho.rua, rascunho.numero)
  // "Vou assistir aqui" só existe com jogo que ainda não começou.
  const marcavel = jogos.some((jogo) => new Date(jogo.startsAt) > now)

  return (
    <Moldura
      rotulo={`Prévia da página de ${nome} no app`}
      altura={844}
      rola
      fixos={
        // O véu do topo, os botões sobre a foto e o "Vou assistir aqui".
        <>
          <div
            className="previa-veu pointer-events-none absolute inset-x-0 top-0 h-[111px]"
            style={{
              background:
                'linear-gradient(180deg, var(--a-sheet) 0%, var(--a-sheet) 60%, transparent)'
            }}
          />
          <div className="pointer-events-none absolute inset-x-4 top-[53px] flex justify-between">
            <Redondo tamanho={40}>
              <IconeDoApp nome="back" tamanho={18} cor={PAPER} />
            </Redondo>
            <div className="flex gap-2.5">
              <Redondo tamanho={44}>
                <IconeDoApp nome="share" tamanho={19} cor={PAPER} />
              </Redondo>
              <Redondo tamanho={44}>
                <IconeDoApp nome="fan" tamanho={20} cor={PAPER} />
              </Redondo>
            </div>
          </div>
          {marcavel ? (
            <div
              className="previa-vidro pointer-events-none absolute inset-x-3.5 bottom-7 flex h-[70px] items-center rounded-[35px] px-[9px]"
              style={{ background: 'var(--a-glass)' }}
            >
              <div className="relative h-[52px] flex-1">
                <span className="absolute inset-x-0 top-[3px] h-[52px] rounded-[26px] bg-[#12120f]" />
                <span className="relative flex h-[52px] items-center justify-center gap-2 rounded-[26px] bg-[#c9f135] px-[22px] text-[#12120f]">
                  <IconeDoApp nome="ticket" tamanho={18} cor={INK} />
                  <b className="truncate" style={texto(15, 700, 1.2)}>
                    Vou assistir aqui
                  </b>
                </span>
              </div>
            </div>
          ) : null}
        </>
      }
    >
      {/* Foto com o nome (340 pt). */}
      <div className="relative flex h-[340px] flex-col justify-end">
        <div
          className="absolute inset-0 bg-[#2a2a25] bg-center bg-cover"
          style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {}}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_18_15/30%),rgb(18_18_15/0%)_35%,rgb(18_18_15/82%))]" />
        <div className="relative p-[18px]">
          {elite || nota ? (
            <div className="mb-2 flex gap-1.5">
              {elite ? (
                <Pilula tom="acid" altura={28}>
                  <IconeDoApp nome="medal" tamanho={15} cor={INK} />
                  <b className="text-[#12120f]" style={texto(12, 700, 1.2)}>
                    Elite
                  </b>
                </Pilula>
              ) : null}
              {nota ? (
                <Pilula tom="dark" altura={28}>
                  <b className="text-[#f1eee6]" style={texto(12, 700, 1.2)}>
                    {nota.percentage}% voltariam
                  </b>
                </Pilula>
              ) : null}
            </div>
          ) : null}
          <Encolhe
            tamanho={52}
            className="previa-anton line-clamp-2 text-[#f1eee6] uppercase"
            style={{ letterSpacing: -1, margin: '-12px 0' }}
          >
            {nome}
          </Encolhe>
          <p
            className="mt-1 line-clamp-2 text-[#e2dfd7]"
            style={texto(14, 400, 1.4)}
          >
            {info.join(' · ') || ' '}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 p-4 pb-[170px]">
        {proximo ? (
          <>
            <b style={texto(16, 700)}>
              {diaDoJogo(proximo.startsAt, now) === 'Hoje' ||
              new Date(proximo.startsAt).getTime() <= agora
                ? 'Hoje no telão'
                : 'Próximo jogo'}
            </b>
            <Ingresso {...visto} />
          </>
        ) : (
          <p className="text-[var(--a-muted)]" style={texto(15)}>
            Nenhum jogo marcado por enquanto.
          </p>
        )}

        {ladrilhos.length ? (
          <div className="flex gap-2">
            {ladrilhos.map((l) => (
              <Cartao
                key={l.id}
                className="min-w-0 flex-1"
                style={{
                  padding: '11px 6px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <IconeDoApp
                  nome={l.icone}
                  tamanho={26}
                  cor="var(--a-ink)"
                  acento="var(--a-accent)"
                />
                <span className="text-center" style={texto(11.5, 600, 1.4)}>
                  {l.rotulo}
                </span>
              </Cartao>
            ))}
          </div>
        ) : null}

        {oferta ? (
          <Cartao sombra="rgb(201 241 53 / 85%)" desvio={5}>
            <div className="flex">
              <div className="relative grid w-[62px] flex-none place-items-center bg-[#c9f135]">
                <IconeDoApp nome="ticket" tamanho={26} cor={INK} />
                <svg
                  className="absolute top-0 -right-px h-full w-0.5"
                  aria-hidden="true"
                >
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2="100%"
                    stroke="rgb(18 18 15 / 25%)"
                    strokeWidth="1.5"
                    strokeDasharray="4.5 4.5"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1 px-3.5 py-3">
                <b className="block" style={texto(14.5, 700)}>
                  Oferta da casa
                </b>
                <p
                  className="text-[var(--a-muted)] [overflow-wrap:anywhere]"
                  style={texto(13)}
                >
                  {oferta}
                </p>
              </div>
            </div>
          </Cartao>
        ) : null}

        {jogos.length > 1 ? (
          <>
            <Titulo
              titulo="Próximos jogos aqui"
              aside={`${semana} esta semana`}
            />
            <Cartao soft>
              <div className="px-3.5">
                {jogos.slice(1, 1 + MAIS_JOGOS).map((jogo, indice) => {
                  const titulo = gameTitle(jogo)
                  const tela = resolveEventScreen(jogo, rascunho.amenities)
                  const etiqueta = tela.onBigScreen
                    ? 'Telão'
                    : tela.withSound
                      ? 'Som ligado'
                      : null
                  return (
                    <div
                      key={jogo.id}
                      className={`flex items-center gap-3 py-[11px] ${linhaComFio(indice)}`}
                    >
                      <span className="previa-anton my-[-5.5px] w-[62px] flex-none text-[22px] tabular-nums">
                        {diaNaLista(jogo.startsAt, now)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b
                          className="line-clamp-2 block"
                          style={texto(14.5, 700)}
                        >
                          {titulo}
                        </b>
                        <div
                          className="flex min-w-0 text-[var(--a-muted)]"
                          style={texto(12)}
                        >
                          {titulo === jogo.championship ? null : (
                            <span className="min-w-0 truncate">
                              {jogo.championship} ·&nbsp;
                            </span>
                          )}
                          <span className="flex-none">
                            {diaDoJogo(jogo.startsAt, now) === 'Hoje'
                              ? 'hoje'
                              : horaDoJogo(jogo.startsAt)}
                          </span>
                        </div>
                      </div>
                      {etiqueta ? (
                        <Etiqueta
                          style={{
                            ...texto(10.5, 700, 1.2),
                            padding: '3px 6px'
                          }}
                        >
                          {etiqueta}
                        </Etiqueta>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Cartao>
          </>
        ) : null}

        {caracteristicas.length ? (
          <>
            <Titulo titulo="O que tem" />
            <div className="flex flex-wrap gap-1.5">
              {caracteristicas.map((rotulo) => (
                <Etiqueta
                  key={rotulo}
                  style={{ ...texto(11.5, 600), padding: '4px 8px' }}
                >
                  {rotulo}
                </Etiqueta>
              ))}
            </div>
          </>
        ) : null}

        {localizado ? (
          <>
            <Titulo titulo="Onde fica" />
            <Cartao soft>
              <div
                className="flex h-[130px] items-end justify-center pb-[18px]"
                style={LISTRAS}
              >
                <Gota
                  nome={nome}
                  quando={quandoNaGota(proximo ?? null, aoVivo, now)}
                  aoVivo={aoVivo}
                  elite={elite}
                />
              </div>
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <b className="block truncate" style={texto(14.5, 700)}>
                    {endereco}
                  </b>
                  <span
                    className="block truncate text-[var(--a-muted)]"
                    style={texto(12.5)}
                  >
                    {rascunho.neighborhood.trim()}
                  </span>
                </div>
                <span
                  className="rounded-[4px] bg-[var(--a-ink)] px-3 py-[9px] text-[var(--a-paper)]"
                  style={texto(13, 700)}
                >
                  Como chegar
                </span>
              </div>
            </Cartao>
          </>
        ) : null}

        {horario ? (
          <>
            <Titulo
              titulo="Horário"
              aside={
                aberto === null
                  ? undefined
                  : aberto
                    ? 'Aberto agora'
                    : 'Fechado agora'
              }
            />
            <Cartao soft>
              <div className="px-3.5">
                {groupOpeningHours(horario).map((linha, indice) => (
                  <div
                    key={linha.days}
                    className={`flex items-baseline justify-between gap-3 py-[11px] ${linhaComFio(indice)}`}
                  >
                    <span style={texto(13.5)}>{linha.days}</span>
                    <span
                      className="previa-mono text-[13px]"
                      style={{
                        color: linha.hours ? 'var(--a-ink)' : 'var(--a-muted)'
                      }}
                    >
                      {linha.hours ?? 'Fechado'}
                    </span>
                  </div>
                ))}
              </div>
            </Cartao>
          </>
        ) : null}

        {nota ? (
          <>
            <Titulo
              titulo="O que dizem"
              aside={`${nota.total} ${nota.total === 1 ? 'avaliação' : 'avaliações'}`}
            />
            <div className="relative">
              <SombraDura cor="var(--a-score-shadow)" desvio={4} />
              <div className="relative flex items-center gap-2.5 rounded-[6px] bg-[#c9f135] p-3.5 text-[#12120f]">
                <span className="previa-anton my-[-11px] text-[44px]">
                  {nota.percentage}%
                </span>
                <span className="flex-1" style={texto(13.5, 600, 1.35)}>
                  dos torcedores voltariam para ver outro jogo aqui
                </span>
              </div>
            </div>
            {motivos && (motivos.positive.length || motivos.negative.length) ? (
              <Cartao soft>
                <div className="px-3.5">
                  {(
                    [
                      [true, motivos.positive],
                      [false, motivos.negative]
                    ] as const
                  )
                    .filter(([, ids]) => ids.length)
                    .map(([volta, ids], indice) => (
                      <div
                        key={String(volta)}
                        className={`flex flex-col gap-2.5 py-3 ${linhaComFio(indice)}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="grid size-[30px] flex-none place-items-center rounded-[4px]"
                            style={{
                              background: volta ? ACID : 'var(--a-mark)'
                            }}
                          >
                            {volta ? (
                              <IconeDoApp nome="fan" tamanho={15} cor={INK} />
                            ) : (
                              <IconeDoApp
                                nome="close"
                                tamanho={15}
                                cor="var(--a-ink)"
                              />
                            )}
                          </span>
                          <b
                            className="flex-1 truncate"
                            style={texto(15, 700, 1.3)}
                          >
                            {volta ? 'Quem voltaria' : 'Quem não voltaria'}
                          </b>
                          <span
                            className="text-[var(--a-muted)]"
                            style={texto(12.5)}
                          >
                            mais citados
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ids.map((id) => (
                            <Etiqueta
                              key={id}
                              style={{
                                ...texto(12.5, 700, 1.3),
                                padding: '4px 8px'
                              }}
                            >
                              {reasonLabel(id)}
                            </Etiqueta>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </Cartao>
            ) : null}
          </>
        ) : null}

        <span
          className="self-end p-1 text-[var(--a-muted)]"
          style={texto(13.5, 600)}
        >
          Reportar um problema
        </span>
      </div>
    </Moldura>
  )
}
