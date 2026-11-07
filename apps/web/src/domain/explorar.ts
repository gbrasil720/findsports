import { getEventEnd } from '@findsports_oficial/db/event-window'
import { brasiliaTime, shiftDay } from '@/components/painel/noite'

/*
 * Contas do Explorar do web do torcedor (WEB-501): os dias da régua, a régua
 * em faixas, o filtro e a ordem dos bares de um jogo. Sem React, para o teste.
 */

const MINUTE = 60_000

/** O que a régua e a lista leem de um jogo (`pubs.gameBoard`). */
export type JogoDaRegua = {
  key: string
  title: string
  championship: string
  startsAt: string
  endsAt: string | null
  bars: BarDoJogo[]
}

export type BarDoJogo = {
  eventId: string
  barId: string
  name: string
  neighborhood: string
  photoUrl: string | null
  latitude: number
  longitude: number
  distanceKm: number
  elite: boolean
  amenities: number[]
  onBigScreen: boolean
  withSound: boolean
  offer: string | null
  rating: { total: number; stars: number | null } | null
  closes: string | null
  attendanceEnabled: boolean
  going: { count: number; initials: string[] } | null
}

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'short'
})

/** Hoje, amanhã e os dois dias seguintes: "Hoje", "Amanhã", "Sáb 7", "Dom 8". */
export function diasDaRegua(hoje: string): { day: string; rotulo: string }[] {
  return [0, 1, 2, 3].map((n) => {
    const day = shiftDay(hoje, n)
    if (n === 0) return { day, rotulo: 'Hoje' }
    if (n === 1) return { day, rotulo: 'Amanhã' }
    const semana = WEEKDAY.format(new Date(`${day}T12:00:00.000Z`)).replace(
      '.',
      ''
    )
    return {
      day,
      rotulo: `${semana[0]?.toUpperCase()}${semana.slice(1)} ${Number(day.slice(8))}`
    }
  })
}

/** Minutos desde a meia-noite de Brasília do dia `day`. */
function minutosNoDia(at: Date | string, day: string): number {
  const [h = 0, m = 0] = brasiliaTime(at).split(':').map(Number)
  const dia =
    new Date(at).getTime() >=
    new Date(`${shiftDay(day, 1)}T03:00:00Z`).getTime()
  return h * 60 + m + (dia ? 24 * 60 : 0)
}

export type EstadoDoJogo = 'past' | 'live' | 'next'

export function estadoDoJogo(
  jogo: { startsAt: string; endsAt: string | null },
  now: number
): EstadoDoJogo {
  const inicio = new Date(jogo.startsAt).getTime()
  if (getEventEnd(jogo).getTime() <= now) return 'past'
  return inicio <= now ? 'live' : 'next'
}

/** Minutos de jogo, para o "AO VIVO 34'". */
export function minutoDeJogo(startsAt: string, now: number): string {
  return `${Math.max(1, Math.floor((now - new Date(startsAt).getTime()) / MINUTE))}'`
}

export type FaixaDaRegua = {
  jogo: JogoDaRegua
  /** Início e largura em % da régua. */
  left: number
  width: number
  lane: number
}

/**
 * A régua do dia: das 16h às 2h, como no protótipo, esticada em horas cheias
 * para caber um jogo da tarde ou da madrugada. Jogos que se cruzam vão em
 * faixas.
 */
export function regua(jogos: JogoDaRegua[], day: string, now: number) {
  const spans = jogos
    .map((jogo) => {
      const start = minutosNoDia(jogo.startsAt, day)
      const length = Math.max(
        60,
        (getEventEnd(jogo).getTime() - new Date(jogo.startsAt).getTime()) /
          MINUTE
      )
      return { jogo, start, end: start + length }
    })
    .sort((a, b) => a.start - b.start)
  const from = Math.min(
    16 * 60,
    ...spans.map((s) => Math.floor(s.start / 60) * 60)
  )
  const to = Math.max(26 * 60, ...spans.map((s) => Math.ceil(s.end / 60) * 60))
  const width = to - from
  const at = (minutes: number) => ((minutes - from) / width) * 100

  const laneEnds: number[] = []
  const faixas: FaixaDaRegua[] = spans.map(({ jogo, start, end }) => {
    let lane = laneEnds.findIndex((fim) => fim <= start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = end
    const left = at(start)
    return { jogo, left, width: at(end) - left, lane }
  })
  const agora = minutosNoDia(new Date(now), day)
  const hoje = new Date(now).getTime() >= new Date(`${day}T03:00:00Z`).getTime()
  return {
    horas: Array.from({ length: width / 60 + 1 }, (_, i) => ({
      hora: (from / 60 + i) % 24,
      at: ((i * 60) / width) * 100
    })),
    faixas,
    lanes: Math.max(1, laneEnds.length),
    agora: hoje && agora >= from && agora <= to ? at(agora) : null,
    /** Largura mínima em px: 98 por hora, como os 980 px do protótipo. */
    minWidth: (width / 60) * 98
  }
}

/** O jogo que a lista abre: o escolhido, senão o ao vivo, senão o próximo. */
export function jogoInicial(
  jogos: JogoDaRegua[],
  escolhido: string | undefined,
  now: number
): JogoDaRegua | undefined {
  return (
    jogos.find((jogo) => jogo.key === escolhido) ??
    jogos.find((jogo) => estadoDoJogo(jogo, now) === 'live') ??
    jogos.find((jogo) => estadoDoJogo(jogo, now) === 'next') ??
    jogos[jogos.length - 1]
  )
}

const dobrar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type Ordem = 'perto' | 'gente' | 'nota'

/** Os bares do jogo que passam nos filtros, na ordem escolhida. */
export function baresDoJogo(
  jogo: JogoDaRegua | undefined,
  filtros: { amenities: number[]; oferta: boolean; busca: string; ordem: Ordem }
): BarDoJogo[] {
  if (!jogo) return []
  const busca = dobrar(filtros.busca.trim())
  const jogoCasa = busca
    ? dobrar(`${jogo.title} ${jogo.championship}`).includes(busca)
    : true
  const lista = jogo.bars.filter(
    (bar) =>
      filtros.amenities.every((id) => bar.amenities.includes(id)) &&
      (!filtros.oferta || bar.offer !== null) &&
      (jogoCasa || dobrar(`${bar.name} ${bar.neighborhood}`).includes(busca))
  )
  const porPerto = (a: BarDoJogo, b: BarDoJogo) => a.distanceKm - b.distanceKm
  if (filtros.ordem === 'gente') {
    return lista.sort(
      (a, b) => (b.going?.count ?? 0) - (a.going?.count ?? 0) || porPerto(a, b)
    )
  }
  if (filtros.ordem === 'nota') {
    return lista.sort(
      (a, b) =>
        (b.rating?.stars ?? 0) - (a.rating?.stars ?? 0) || porPerto(a, b)
    )
  }
  return lista.sort(porPerto)
}

/** "450 m" ou "1,2 km". */
export function distancia(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

/** Os jogos que casam com a busca: pelo título, campeonato ou um bar dele. */
export function jogosDaBusca(jogos: JogoDaRegua[], busca: string) {
  const termo = dobrar(busca.trim())
  if (!termo) return jogos
  return jogos.filter(
    (jogo) =>
      dobrar(`${jogo.title} ${jogo.championship}`).includes(termo) ||
      jogo.bars.some((bar) =>
        dobrar(`${bar.name} ${bar.neighborhood}`).includes(termo)
      )
  )
}
