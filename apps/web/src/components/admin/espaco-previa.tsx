import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import { gameTitle, matchSides } from '@findsports_oficial/db/game-title'
import { normalizeHouseOffer } from '@findsports_oficial/db/house-offer'
import { type ReactNode, useState } from 'react'
import { Chip, Icone, type IconeNome } from '@/components/painel'
import {
  compareEventStartsAscending,
  getEventTemporalState
} from '@/domain/events'
import type { AdminEvent } from './admin-model'
import {
  abertoAte,
  diaDoJogo,
  horaDoJogo,
  horarioDoRascunho,
  iniciaisDoApp,
  quandoNaGota,
  type Rascunho,
  siglaDoTime
} from './espaco-model'

const PAPER = '#f1eee6'
const INK = '#12120f'
const ACID = '#c9f135'
const MUTED = '#aaa9a4'

type Props = {
  rascunho: Rascunho
  photoUrl: string | null
  /** Elite em dia: selo e oferta da casa, como o torcedor vê. */
  elite: boolean
  /** Jogos do bar; `null` enquanto carregam. */
  events: AdminEvent[] | null
  /** "% voltariam" público (acima do piso); `null` quando não aparece. */
  nota: number | null
  now: Date
}

/** O que as três prévias dividem, contado uma vez. */
type Visto = Props & {
  nome: string
  /** Os próximos jogos (ao vivo e futuros), do mais cedo. */
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

/**
 * "Como o torcedor vê" (2c/2d): a página do bar no app, o card da lista do
 * Explorar e a gota do mapa, escuros como o app, montados do rascunho. Não
 * agem: são só desenho. A distância ("0,8 km") fica de fora: o painel não tem
 * de onde medir.
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
      <div className="flex w-full items-center justify-between gap-3">
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
        <CardDoApp {...visto} />
      ) : (
        <MapaDoApp {...visto} />
      )}
      <p className="max-w-[300px] text-center text-[12.5px] text-[var(--painel-muted)]">
        Atualiza enquanto você edita. O que não estiver salvo aparece só aqui.
      </p>
    </div>
  )
}

/** O aparelho em volta da prévia: não age, e o leitor de tela ouve o rótulo. */
function Moldura({
  rotulo,
  children
}: {
  rotulo: string
  children: ReactNode
}) {
  return (
    <div
      inert
      aria-label={rotulo}
      role="img"
      className="w-[340px] max-w-full rounded-[34px] bg-black p-2.5 shadow-[0_30px_50px_-25px_rgb(18_18_15/60%)]"
    >
      {children}
    </div>
  )
}

function TelaDoApp({
  rascunho,
  photoUrl,
  elite,
  nota,
  now,
  nome,
  jogos: todos
}: Visto) {
  const linha = [
    rascunho.neighborhood.trim(),
    abertoAte(horarioDoRascunho(rascunho.hours), now),
    nota !== null ? `${nota}% voltariam` : null
  ]
    .filter(Boolean)
    .join(' · ')
  const etiquetas = [
    ...rascunho.amenities
      .map((id) => findAmenity(id)?.label.split(' / ')[0])
      .filter((label): label is string => Boolean(label))
      .slice(0, rascunho.screenCount ? 2 : 3),
    ...(rascunho.screenCount
      ? [
          `${rascunho.screenCount} ${rascunho.screenCount === 1 ? 'tela' : 'telas'}`
        ]
      : [])
  ]
  const oferta = elite ? normalizeHouseOffer(rascunho.houseOffer) : null
  const jogos = todos.slice(0, 2)

  return (
    <Moldura rotulo={`Prévia da página de ${nome} no app`}>
      <div className="relative flex h-[640px] flex-col overflow-hidden rounded-[26px] bg-[#12120f] text-[#f1eee6]">
        <div
          className="relative h-[200px] flex-none bg-[#262621] bg-center bg-cover"
          style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {}}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_18_15/0%)_40%,#12120f)]" />
          <div className="absolute inset-x-3.5 top-3.5 flex justify-between">
            <span className="grid size-[34px] place-items-center rounded-full bg-[rgb(36_36_32/50%)]">
              <Icone nome="back" tamanho={14} acento="#f1eee6" />
            </span>
            <span className="grid size-[34px] place-items-center rounded-full bg-[rgb(36_36_32/50%)]">
              <Icone nome="heart" tamanho={16} acento="#c9f135" />
            </span>
          </div>
        </div>
        <div className="relative -mt-[26px] flex min-h-0 flex-col gap-3 px-4">
          {elite ? (
            <div className="flex gap-1.5">
              <span className="rounded-[3px] bg-[#c9f135] px-[7px] py-[3px] font-bold text-[#12120f] text-[11px] leading-tight">
                Elite
              </span>
            </div>
          ) : null}
          <p className="painel-disp break-words [--painel-disp-size:40px]">
            {nome}
          </p>
          {linha ? <p className="text-[#aaa9a4] text-[13px]">{linha}</p> : null}
          {etiquetas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((etiqueta) => (
                <span
                  key={etiqueta}
                  className="rounded-[4px] px-2 py-[5px] font-semibold text-[11.5px] shadow-[inset_0_0_0_1px_rgb(241_238_230/18%)]"
                >
                  {etiqueta}
                </span>
              ))}
            </div>
          ) : null}
          {oferta ? (
            <div className="flex items-center gap-2.5 rounded-[7px] bg-[#c9f135] px-3.5 py-3 text-[#12120f] shadow-[3px_3px_0_#000]">
              <Icone nome="ticket" tamanho={22} acento="#12120f" />
              <div className="min-w-0">
                <b className="text-[13.5px]">Oferta da casa</b>
                <p className="text-[12px] [overflow-wrap:anywhere]">{oferta}</p>
              </div>
            </div>
          ) : null}
          {jogos.length ? (
            <>
              <b className="mt-0.5 text-[14px]">Jogos aqui</b>
              {jogos.map((jogo) => (
                <div
                  key={jogo.id}
                  className="flex items-center gap-3 rounded-[7px] bg-[#1c1c18] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(241_238_230/9%)]"
                >
                  <span className="painel-disp [--painel-disp-size:22px]">
                    {horaDoJogo(jogo.startsAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13px]">
                      {gameTitle(jogo)}
                    </b>
                    <span className="block truncate text-[#aaa9a4] text-[11.5px]">
                      {jogo.championship}
                    </span>
                  </div>
                  {getEventTemporalState(jogo.startsAt, jogo.endsAt, now) ===
                  'live' ? (
                    <span className="rounded-[3px] bg-[#e8320c] px-[7px] py-[3px] font-bold text-[11px] text-white">
                      Ao vivo
                    </span>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}
        </div>
        <div className="absolute inset-x-3.5 bottom-4 flex h-[50px] items-center justify-center rounded-full bg-[#c9f135] font-bold text-[#12120f] text-[14.5px] shadow-[0_3px_0_#000]">
          Vou assistir aqui
        </div>
      </div>
    </Moldura>
  )
}

/** As características que viram ícone no card do app (`AMENITY_ICONS`). */
const ICONES_DO_CARD: [number, IconeNome][] = [
  [1, 'tv'],
  [2, 'sound'],
  [4, 'sun']
]

/** Selo de vidro sobre a foto ("Ao vivo", "Elite", "Hoje às 21:30"). */
function SeloDeVidro({
  fundo,
  children
}: {
  fundo: string
  children: ReactNode
}) {
  return (
    <span
      className="flex h-[30px] items-center gap-1.5 rounded-full px-[11px] backdrop-blur-md"
      style={{ background: fundo }}
    >
      {children}
    </span>
  )
}

/**
 * O card da lista do Explorar (`BarTicket` do app): foto com os selos, o jogo,
 * o picote e o bar. A sombra muda com o estado: vermelha ao vivo, acid no
 * Elite. Quantos vão não entra: o rascunho não tem como saber.
 */
function CardDoApp({
  rascunho,
  photoUrl,
  elite,
  nota,
  now,
  nome,
  jogos,
  aoVivo
}: Visto) {
  const jogo = jogos[0]
  const sombra = aoVivo
    ? '5px 5px 0 rgb(232 50 12 / 30%)'
    : elite
      ? '5px 5px 0 rgb(201 241 53 / 85%)'
      : '4px 4px 0 rgb(0 0 0 / 35%)'
  const icones = ICONES_DO_CARD.filter(([id]) =>
    rascunho.amenities.includes(id)
  )
  return (
    <Moldura rotulo={`Prévia do card de ${nome} na lista do app`}>
      <div className="rounded-[26px] bg-[#161613] px-4 pt-5 pb-6 text-[#f1eee6]">
        <div
          className="overflow-hidden rounded-[6px] border border-[rgb(241_238_230/9%)] bg-[#1c1c18]"
          style={{ boxShadow: sombra }}
        >
          <div
            className="relative grid h-32 place-items-center bg-[#2a2a25] bg-center bg-cover"
            style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {}}
          >
            {photoUrl ? null : (
              <span className="font-bold text-[34px] text-[rgb(241_238_230/22%)]">
                {iniciaisDoApp(nome)}
              </span>
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_18_15/0%)_40%,rgb(18_18_15/55%))]" />
            <div className="absolute top-2.5 left-2.5 flex gap-1.5">
              {aoVivo ? (
                <SeloDeVidro fundo="rgb(232 50 12 / 78%)">
                  <span className="size-[7px] rounded-full bg-[#f1eee6]" />
                  <b className="text-[#12120f] text-[12.5px]">Ao vivo</b>
                </SeloDeVidro>
              ) : jogo ? (
                <SeloDeVidro fundo="rgb(36 36 32 / 40%)">
                  <span className="font-[family-name:var(--onside-mono)] font-semibold text-[12px]">
                    {diaDoJogo(jogo.startsAt, now)} às{' '}
                    {horaDoJogo(jogo.startsAt)}
                  </span>
                </SeloDeVidro>
              ) : null}
              {elite ? (
                <SeloDeVidro fundo="rgb(201 241 53 / 82%)">
                  <Icone
                    nome="medal"
                    tamanho={14}
                    acento={INK}
                    base={0.35}
                    style={{ color: INK }}
                  />
                  <b className="text-[#12120f] text-[12.5px]">Elite</b>
                </SeloDeVidro>
              ) : null}
            </div>
            <span className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-[rgb(36_36_32/40%)] backdrop-blur-md">
              <Icone
                nome="heart"
                tamanho={18}
                base={0.3}
                style={{ color: PAPER }}
              />
            </span>
          </div>
          {jogo ? (
            <>
              <LinhaDoJogo jogo={jogo} aoVivo={aoVivo} />
              <div className="relative flex h-[18px] items-center">
                <span className="absolute -left-[9px] size-[18px] rounded-full bg-[#161613]" />
                <svg className="mx-3.5 h-0.5 flex-1" aria-hidden="true">
                  <line
                    x1="0"
                    y1="1"
                    x2="100%"
                    y2="1"
                    stroke="rgb(241 238 230 / 16%)"
                    strokeWidth="1.5"
                    strokeDasharray="4.5 4.5"
                  />
                </svg>
                <span className="absolute -right-[9px] size-[18px] rounded-full bg-[#161613]" />
              </div>
            </>
          ) : (
            <div className="h-3" />
          )}
          <div className="flex items-center gap-2.5 px-3.5 pb-[13px]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[7px]">
                <b className="truncate text-[17px] tracking-[-0.17px]">
                  {nome}
                </b>
                {nota !== null ? (
                  <span className="shrink-0 rounded-[3px] bg-[#c9f135] px-1.5 py-[3px] font-bold text-[#12120f] text-[10.5px] leading-tight">
                    {nota}% voltariam
                  </span>
                ) : null}
              </div>
              <div className="mt-[3px] flex items-center gap-2">
                <span
                  className="truncate text-[12.5px]"
                  style={{ color: MUTED }}
                >
                  {rascunho.neighborhood.trim()}
                </span>
                {icones.length ? (
                  <span
                    className="flex flex-none gap-1.5"
                    style={{ color: MUTED }}
                  >
                    {icones.map(([id, icone]) => (
                      <Icone
                        key={id}
                        nome={icone}
                        tamanho={15}
                        acento={MUTED}
                        base={0.3}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Moldura>
  )
}

/** Time contra time com a hora no meio (`MatchRow` do app). */
function LinhaDoJogo({ jogo, aoVivo }: { jogo: AdminEvent; aoVivo: boolean }) {
  const lados = matchSides(jogo)
  const titulo = gameTitle(jogo)
  const meio = (
    <span className="flex max-w-28 flex-none flex-col items-center">
      <span
        className="painel-disp [--painel-disp-size:22px]"
        style={{ color: aoVivo ? '#f3421d' : PAPER }}
      >
        {aoVivo ? 'AO VIVO' : horaDoJogo(jogo.startsAt)}
      </span>
      {lados || titulo !== jogo.championship ? (
        <span
          className="mt-0.5 max-w-full truncate font-[family-name:var(--onside-mono)] font-semibold text-[10.5px]"
          style={{ color: MUTED }}
        >
          {jogo.championship}
        </span>
      ) : null}
    </span>
  )
  if (!lados) {
    return (
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <b className="line-clamp-2 flex-1 text-[14px]">{titulo}</b>
        {meio}
      </div>
    )
  }
  const time = (nome: string, direita?: boolean) => (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${direita ? 'flex-row-reverse text-right' : ''}`}
    >
      <span className="painel-disp grid size-10 flex-none place-items-center rounded-full border-2 border-[rgb(241_238_230/12%)] bg-[#2a2a25] tracking-[0.3px] [--painel-disp-size:15px]">
        {siglaDoTime(nome)}
      </span>
      <b className="truncate text-[14px]">{nome}</b>
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

/**
 * A gota do bar tocado no mapa (`MapDrop` do app, 21a), sobre o fundo listrado
 * do design no lugar dos tiles: tinta com copo; vermelha com telão e halo se
 * ao vivo; acid com estrela se Elite. O balão traz o nome e quando.
 */
function MapaDoApp({ nome, elite, now, jogos, aoVivo }: Visto) {
  const cor = aoVivo ? '#e8320c' : elite ? ACID : INK
  const quando = quandoNaGota(jogos[0] ?? null, aoVivo, now)
  const icone: [IconeNome, string, string] = aoVivo
    ? ['tv', PAPER, PAPER]
    : elite
      ? ['star', INK, INK]
      : ['beer', PAPER, ACID]
  return (
    <Moldura rotulo={`Prévia do pino de ${nome} no mapa do app`}>
      <div
        className="grid h-[420px] place-items-center rounded-[26px] px-4"
        style={{
          background:
            'repeating-linear-gradient(135deg, #22221e 0 8px, #1c1c18 8px 16px)'
        }}
      >
        <div className="flex max-w-full flex-col items-center gap-2">
          <div className="flex max-w-full flex-col items-center gap-0.5 rounded-[12px] bg-[#12120f] px-[11px] py-[7px] text-center shadow-[3px_4px_0_#c9f135]">
            <b className="break-words text-[#f1eee6] text-[13px] leading-[1.25]">
              {nome}
            </b>
            {quando ? (
              <span className="font-[family-name:var(--onside-mono)] font-semibold text-[#c9f135] text-[11px]">
                {quando}
              </span>
            ) : null}
          </div>
          <div className="relative h-[51px] w-10">
            {aoVivo ? (
              <span className="absolute top-[38.4px] left-[1.4px] size-[37.2px] rounded-full border-[6px] border-[rgb(232_50_12/10%)] bg-[rgb(232_50_12/20%)]" />
            ) : null}
            <span
              className="absolute inset-x-0 top-0 h-10 -rotate-45 rounded-[20px_20px_20px_3px] border-[#1c1c18] border-[2.5px] shadow-[3px_-1px_0_rgb(18_18_15/22%)]"
              style={{ background: cor }}
            />
            <span
              className="absolute inset-x-0 top-0 grid h-10 place-items-center"
              style={{ color: icone[1] }}
            >
              <Icone
                nome={icone[0]}
                tamanho={20}
                acento={icone[2]}
                base={0.3}
              />
            </span>
          </div>
        </div>
      </div>
    </Moldura>
  )
}
