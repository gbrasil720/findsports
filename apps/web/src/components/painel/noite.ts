import { getEventEnd } from '@findsports_oficial/db/event-window'
import type { AdminEvent } from '@/components/admin/admin-model'
import { toCommercialDate } from '@/components/admin/analytics-period'
import { getEventTemporalState } from '@/domain/events'
import { getGameTitle } from '@/domain/reservation-validation'

/*
 * Relógio das telas Hoje e Jogos (WEB-501, fase 2): hora e dia de Brasília,
 * o dia da casa (vira às 6h, como no painel antigo) e a régua "A noite" (18h
 * a 2h, esticando para caber os jogos). Fim do jogo e "ao vivo" vêm de
 * `event-window` (por `getEventTemporalState`), nunca daqui.
 */

const TZ = 'America/Sao_Paulo'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY_TURN_HOUR = 6
const NIGHT_START_HOUR = 18

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

/** "19:30" em Brasília. */
export function brasiliaTime(date: Date | string): string {
  return clock.format(new Date(date))
}

function brasiliaMinutes(date: Date | string): number {
  const [h = 0, m = 0] = brasiliaTime(date).split(':').map(Number)
  return h * 60 + m
}

/** Dia da casa (`aaaa-mm-dd`): o jogo da 1h ainda é da noite de ontem. */
export function houseDay(date: Date | string | number): string {
  return toCommercialDate(
    new Date(new Date(date).getTime() - DAY_TURN_HOUR * HOUR)
  )
}

/** Dia de Brasília (`aaaa-mm-dd`), sem a virada das 6h: o da grade. */
export function brasiliaDay(date: Date | string | number): string {
  return toCommercialDate(new Date(date))
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const dayParts = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})
const longWeekday = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long'
})

function parts(day: string) {
  const all = dayParts.formatToParts(new Date(`${day}T12:00:00.000Z`))
  const get = (type: string) =>
    (all.find((p) => p.type === type)?.value ?? '').replace('.', '')
  return { weekday: get('weekday'), day: get('day'), month: get('month') }
}

/** "qui, 5 nov". */
export function dayLabel(day: string): string {
  const p = parts(day)
  return `${p.weekday}, ${p.day} ${p.month}`
}

/** "quinta, 5 nov". */
export function longDayLabel(day: string): string {
  const p = parts(day)
  const weekday = longWeekday
    .format(new Date(`${day}T12:00:00.000Z`))
    .split('-')[0]
  return `${weekday}, ${p.day} ${p.month}`
}

/** "dom" e "1 nov", para a semana. */
export function weekdayShort(day: string): { weekday: string; date: string } {
  const p = parts(day)
  return { weekday: p.weekday, date: `${p.day} ${p.month}` }
}

/** Domingo a sábado da semana de `day`, `offset` semanas depois. */
export function weekDays(day: string, offset = 0): string[] {
  const sunday = shiftDay(
    day,
    -new Date(`${day}T12:00:00.000Z`).getUTCDay() + offset * 7
  )
  return Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i))
}

/** "Hoje · qui, 5 nov", "Amanhã · sex, 6 nov", ou só o dia. */
export function relativeDayLabel(day: string, today: string): string {
  if (day === today) return `Hoje · ${dayLabel(day)}`
  if (day === shiftDay(today, 1)) return `Amanhã · ${dayLabel(day)}`
  return dayLabel(day)
}

/** "48min" ou "1h05min", para a contagem do herói. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MINUTE))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h${String(m).padStart(2, '0')}min` : `${m}min`
}

/** "48 min" ou "1h05", para a linha da grade. */
export function inLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MINUTE))
  const h = Math.floor(total / 60)
  return h ? `${h}h${String(total % 60).padStart(2, '0')}` : `${total} min`
}

export function eventTitle(event: AdminEvent): string {
  return getGameTitle({
    championship: event.championship,
    participantFreeText: event.participantFreeText,
    participants: event.participants.map((item) => item.team.name)
  })
}

export function eventState(event: AdminEvent, now: number) {
  return getEventTemporalState(event.startsAt, event.endsAt, now)
}

/** Minutos desde as 18h do dia da casa (negativo antes das 18h). */
export function nightMinutes(date: Date | string): number {
  const m = brasiliaMinutes(date)
  return (m < DAY_TURN_HOUR * 60 ? m + 24 * 60 : m) - NIGHT_START_HOUR * 60
}

export type NightTrack = {
  event: AdminEvent
  /** Início e fim em % da régua. */
  left: number
  width: number
  lane: number
}

/**
 * A régua da noite: das 18h às 2h, esticada em horas cheias para caber os
 * jogos do dia da casa (das 6h às 6h). Jogos que se cruzam vão em faixas.
 */
export function nightRule(
  games: AdminEvent[],
  now: number
): {
  hours: number[]
  tracks: NightTrack[]
  lanes: number
  /** Posição do "agora" em %, ou `null` fora da régua. */
  nowAt: number | null
} {
  const spans = games
    .map((event) => {
      const start = nightMinutes(event.startsAt)
      const length = Math.max(
        30,
        (getEventEnd(event).getTime() - new Date(event.startsAt).getTime()) /
          MINUTE
      )
      return { event, start, end: start + length }
    })
    .sort((a, b) => a.start - b.start)

  const from = Math.max(
    -12 * 60,
    Math.min(0, ...spans.map((s) => Math.floor(s.start / 60) * 60))
  )
  const to = Math.min(
    12 * 60,
    Math.max(8 * 60, ...spans.map((s) => Math.ceil(s.end / 60) * 60))
  )
  const width = to - from
  const at = (minutes: number) => ((minutes - from) / width) * 100

  const laneEnds: number[] = []
  const tracks = spans.map(({ event, start, end }) => {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = end
    const left = at(Math.max(from, start))
    return {
      event,
      left,
      width: Math.min(100, at(Math.min(to, end))) - left,
      lane
    }
  })

  const nowMinutes = nightMinutes(new Date(now))
  return {
    hours: Array.from(
      { length: width / 60 + 1 },
      (_, i) => (NIGHT_START_HOUR + from / 60 + i + 24) % 24
    ),
    tracks,
    lanes: Math.max(1, laneEnds.length),
    nowAt: nowMinutes >= from && nowMinutes <= to ? at(nowMinutes) : null
  }
}

const SEARCH_FOLD = /[̀-ͯ]/g
const fold = (text: string) =>
  text.normalize('NFD').replace(SEARCH_FOLD, '').toLowerCase()

/** Busca da grade: time, campeonato, esporte ou texto livre, sem acento. */
export function matchesSearch(event: AdminEvent, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return fold(
    [eventTitle(event), event.championship, event.sport?.name ?? ''].join(' ')
  ).includes(q)
}
