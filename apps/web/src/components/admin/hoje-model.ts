import {
  BRASILIA_TIME_ZONE,
  brasiliaDay,
  brasiliaDayStart,
  getEventEnd
} from '@findsports_oficial/db/event-window'
import { getEventTemporalState } from '@/domain/events'

/*
 * Contas da tela "Hoje na casa" (`/admin`, telas 1j–1m do design "Bar Web").
 * Puras, sem React: a linha do tempo da noite, a semana e as chegadas.
 */

const HORA = 3_600_000

type Instante = string | Date

/**
 * O dia da casa: a noite de sexta vai até as 6h de sábado. À 1h da manhã o
 * dono ainda está no jogo de ontem, não no dia que acabou de começar.
 */
export function diaDaCasa(at: Instante | number): string {
  return brasiliaDay(new Date(at).getTime() - 6 * HORA)
}

/** `dia` ("2026-10-24") mais `n` dias de calendário. */
export function somaDias(dia: string, n: number): string {
  return brasiliaDay(`${dia}T15:00:00Z`, n)
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
] as const

const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()

const NOMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado'
] as const

/** "segunda", "sábado": o dia da semana por extenso, sem "-feira". */
export const nomeDoDia = (dia: string) => NOMES[diaDaSemana(dia)]

/** "Seg, 12 out", o topo da tela. */
export function dataCurta(dia: string): string {
  return `${DIAS[diaDaSemana(dia)]}, ${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`
}

/** "21:30", no relógio de Brasília. */
export function hora(at: Instante | number): string {
  return new Date(at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BRASILIA_TIME_ZONE
  })
}

/**
 * Os sete dias da semana de `dia`, de domingo a sábado (decisão do dono,
 * 24/10/2026), com o rótulo.
 */
export function semanaDe(dia: string): { dia: string; rotulo: string }[] {
  const domingo = somaDias(dia, -diaDaSemana(dia))
  return Array.from({ length: 7 }, (_, i) => {
    const d = somaDias(domingo, i)
    return { dia: d, rotulo: DIAS[diaDaSemana(d)] }
  })
}

/* ─── A noite ─── */

type JogoComHorario = {
  id: string
  startsAt: Instante
  endsAt: Instante | null
}

export type BlocoNoite<T> = {
  jogo: T
  /** Horas desde a meia-noite do dia da casa (23,75 = 23:45; 25 = 1h). */
  inicio: number
  fim: number
  /** Faixa da linha do tempo: jogos que se cruzam vão um embaixo do outro. */
  linha: number
  estado: 'live' | 'upcoming' | 'past'
}

/**
 * As horas de uma noite (`tl2` do design): os jogos do dia da casa `dia` (das
 * 6h às 6h), de 18h a 2h, alargada se um jogo começa antes ou acaba depois.
 */
function faixaDaNoite<T extends JogoComHorario>(
  eventos: readonly T[],
  dia: string,
  now: number
) {
  const zero = brasiliaDayStart(dia).getTime()
  const horas = (t: number) => (t - zero) / HORA
  const jogos = eventos
    .filter((e) => {
      const h = horas(new Date(e.startsAt).getTime())
      return h >= 6 && h < 30
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )

  const fimDasLinhas: number[] = []
  const blocos: BlocoNoite<T>[] = jogos.map((jogo) => {
    const inicio = horas(new Date(jogo.startsAt).getTime())
    const fim = horas(getEventEnd(jogo).getTime())
    let linha = fimDasLinhas.findIndex((f) => f <= inicio)
    if (linha < 0) linha = fimDasLinhas.push(fim) - 1
    else fimDasLinhas[linha] = fim
    return {
      jogo,
      inicio,
      fim,
      linha,
      estado: getEventTemporalState(jogo.startsAt, jogo.endsAt, now)
    }
  })

  const de = Math.min(18, ...blocos.map((b) => Math.floor(b.inicio)))
  const ate = Math.min(30, Math.max(26, ...blocos.map((b) => Math.ceil(b.fim))))
  const agora = horas(now)
  return {
    dia,
    de,
    ate,
    /** As horas cheias de `de` até a última antes de `ate` (uma coluna cada). */
    horas: Array.from({ length: ate - de }, (_, i) => de + i),
    blocos,
    linhas: fimDasLinhas.length,
    agora: agora >= de && agora <= ate ? agora : null
  }
}

/**
 * A noite de hoje e, à direita, a de amanhã: a tela mostra a de hoje e o dono
 * arrasta para ver a próxima ("arraste para ver amanhã").
 */
export function montarNoite<T extends JogoComHorario>(
  eventos: readonly T[],
  now: number
) {
  const dia = diaDaCasa(now)
  return {
    ...faixaDaNoite(eventos, dia, now),
    amanha: faixaDaNoite(eventos, somaDias(dia, 1), now)
  }
}

/**
 * Posição de uma hora da faixa `de`–`ate` na linha do tempo, em % da largura.
 * `antes` são as colunas que vêm antes da faixa e `total`, as da linha inteira
 * (hoje e amanhã lado a lado).
 */
export function posicao(
  h: number,
  de: number,
  ate: number,
  antes = 0,
  total = ate - de
): number {
  return ((antes + Math.min(Math.max(h, de), ate) - de) / total) * 100
}

/** "18h", "00h", "01h": o rótulo de cada coluna. */
export const rotuloHora = (h: number) => `${String(h % 24).padStart(2, '0')}h`

/**
 * O jogo de que fala o card "Oferta da casa" do Hoje: o ao vivo, senão o
 * próximo, senão o último que acabou. Rascunho fica de fora (o torcedor não o
 * vê). `null` sem jogo publicado na noite: o card volta à oferta padrão.
 */
export function jogoDaOferta<T extends { publishedAt: Instante | null }>(
  blocos: readonly BlocoNoite<T>[]
): T | null {
  const publicados = blocos.filter((b) => b.jogo.publishedAt !== null)
  // Em ordem de início: o primeiro que não acabou é o ao vivo, se houver.
  return (
    (publicados.find((b) => b.estado !== 'past') ?? publicados.at(-1))?.jogo ??
    null
  )
}

/* ─── Contagens ─── */

type LinhaAnalytics = {
  eventId: string
  startsAt: Instante
  reservedPeople: number | null
  arrivals: number | null
}

/**
 * Quem vai e quem chegou nos jogos de `ids`. `null` quando o plano não mostra
 * (o servidor manda `null`, nunca zero).
 */
export function somaDosJogos(
  linhas: readonly LinhaAnalytics[],
  ids: ReadonlySet<string>
): { vao: number; chegaram: number } | null {
  const dos = linhas.filter((l) => ids.has(l.eventId))
  if (dos.some((l) => l.reservedPeople === null || l.arrivals === null)) {
    return null
  }
  return {
    vao: dos.reduce((s, l) => s + (l.reservedPeople ?? 0), 0),
    chegaram: dos.reduce((s, l) => s + (l.arrivals ?? 0), 0)
  }
}

/* ─── Chegaram agora ─── */

type Visita = {
  offer: boolean
  firstVisit: boolean
  visitsThisMonth: number
}

type JogoQuemVai = {
  id: string
  people: {
    name: string
    validatedAt: Instante | null
    arrival: Visita | null
  }[]
}

/** Quem validou o código no dia da casa, do mais recente ao mais antigo. */
export function chegadasDoDia<T extends JogoQuemVai>(
  jogos: readonly T[],
  dia: string
): { nome: string; em: Date; jogo: T; visita: Visita }[] {
  return jogos
    .flatMap((jogo) =>
      jogo.people.flatMap(({ name, validatedAt, arrival }) =>
        validatedAt && arrival && diaDaCasa(validatedAt) === dia
          ? [{ nome: name, em: new Date(validatedAt), jogo, visita: arrival }]
          : []
      )
    )
    .sort((a, b) => b.em.getTime() - a.em.getTime())
}

/**
 * "primeira vez no bar" ou "4ª vez no mês" (1j): as visitas da pessoa a este
 * bar, nunca a outros. Quem já veio em outro mês e volta agora é "1ª vez no
 * mês".
 */
export const vezNoBar = (v: Visita) =>
  v.firstVisit ? 'primeira vez no bar' : `${v.visitsThisMonth}ª vez no mês`
