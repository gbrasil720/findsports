import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import { z } from 'zod'

/**
 * Horário de funcionamento do bar (WEB-397): uma faixa por dia da semana, no
 * relógio de Brasília. Opcional: bar sem horário não mostra a seção.
 *
 * Gravado em `bar.opening_hours` como sete posições, a 0 no domingo (o
 * `getDay` do JS e o `DOW` do Postgres); `null` num dia é fechado. Fechar
 * antes ou na hora de abrir é virar a meia-noite: "17:00 – 02:00" de sexta
 * vai até as 2h de sábado.
 *
 * A regra mora aqui para o painel do bar (o atual e o redesenhado), a página
 * do web e o app lerem igual; "aberto agora" sai pronto de `pubs.getById`.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const dayHoursSchema = z
  .object({ opens: z.string().regex(TIME), closes: z.string().regex(TIME) })
  .refine((day) => day.opens !== day.closes, {
    message: 'Abre e fecha no mesmo horário.'
  })
  .nullable()

export const openingHoursSchema = z.array(dayHoursSchema).length(7)

export type DayHours = z.infer<typeof dayHoursSchema>
export type OpeningHours = DayHours[]

/** Semana toda fechada é o mesmo que não informar: a seção some. */
export function normalizeOpeningHours(
  hours: OpeningHours | null
): OpeningHours | null {
  return hours?.some(Boolean) ? hours : null
}

const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Dia da semana e minuto do dia em Brasília, seja qual for o fuso do processo. */
function brasiliaClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRASILIA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return {
    weekday: WEEKDAYS.indexOf(part('weekday') ?? ''),
    minute: Number(part('hour')) * 60 + Number(part('minute'))
  }
}

/** A faixa aberta no minuto `minute` do dia `weekday`: a de hoje ou a de ontem que virou a meia-noite. */
function slotAt(hours: OpeningHours, weekday: number, minute: number) {
  const today = hours[weekday]
  if (today) {
    const opens = minutes(today.opens)
    const closes = minutes(today.closes)
    if (closes > opens ? minute >= opens && minute < closes : minute >= opens)
      return today
  }
  const yesterday = hours[(weekday + 6) % 7]
  if (yesterday) {
    const opens = minutes(yesterday.opens)
    const closes = minutes(yesterday.closes)
    if (closes <= opens && minute < closes) return yesterday
  }
  return null
}

/**
 * O bar está aberto agora? Olha a faixa de hoje e a de ontem que virou a
 * meia-noite. `null` quando o bar não informou horário.
 */
export function isOpenNow(
  hours: OpeningHours | null,
  now: Date
): boolean | null {
  if (!hours) return null
  const { weekday, minute } = brasiliaClock(now)
  return slotAt(hours, weekday, minute) !== null
}

/**
 * O jogo está dentro do horário de funcionamento (WEB-463)? Vale o início:
 * o bar precisa estar aberto quando a bola rola, no relógio de Brasília. O fim
 * não conta, porque quase nenhum jogo informa e o padrão de 3 h passaria da
 * meia-noite em todo bar que fecha às 00:00. Dia marcado como fechado é fora;
 * bar sem horário nenhum não tem como dizer (`null`) e o painel não avisa.
 */
export function isGameWithinHours(
  hours: OpeningHours | null,
  startsAt: Date
): boolean | null {
  return isOpenNow(hours, startsAt)
}

export type OpeningStatus =
  | { open: true; closes: string }
  /** `inDays`: 0 abre hoje, 1 amanhã... `day` é o dia da semana (0 = domingo). */
  | { open: false; opens: string; inDays: number; day: number }

/**
 * "Aberto agora · fecha às 01:00" ou "Fechado agora · abre às 17:00" (28a):
 * a próxima virada a partir de `now`. `null` sem horário.
 */
export function openingStatus(
  hours: OpeningHours | null,
  now: Date
): OpeningStatus | null {
  const week = normalizeOpeningHours(hours)
  if (!week) return null
  const { weekday, minute } = brasiliaClock(now)
  const slot = slotAt(week, weekday, minute)
  if (slot) return { open: true, closes: slot.closes }
  const today = week[weekday]
  if (today && minute < minutes(today.opens))
    return { open: false, opens: today.opens, inDays: 0, day: weekday }
  for (let inDays = 1; inDays <= 7; inDays++) {
    const day = (weekday + inDays) % 7
    const next = week[day]
    if (next) return { open: false, opens: next.opens, inDays, day }
  }
  return null
}

/** Segunda primeiro, como se lê uma semana de bar. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const FULL = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado'
]

/** "sexta", "sábado": o dia da semana no meio da frase (0 = domingo). */
export const weekdayName = (day: number) => (FULL[day] ?? '').toLowerCase()

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * As linhas da seção "Horário" (2g): dias seguidos com a mesma faixa viram uma
 * linha só ("Seg a qui", "Sex e sáb", "Domingo"). `hours` nulo é fechado.
 */
export function groupOpeningHours(hours: OpeningHours) {
  const same = (a: DayHours, b: DayHours) =>
    a?.opens === b?.opens && a?.closes === b?.closes
  const runs: number[][] = []
  for (const day of ORDER) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    if (
      run &&
      last !== undefined &&
      same(hours[last] ?? null, hours[day] ?? null)
    )
      run.push(day)
    else runs.push([day])
  }
  return runs.map((run) => {
    const first = run[0] ?? 0
    const last = run.at(-1) ?? first
    const day = hours[first] ?? null
    return {
      days:
        run.length === 1
          ? (FULL[first] ?? '')
          : `${capital(SHORT[first] ?? '')} ${run.length === 2 ? 'e' : 'a'} ${SHORT[last]}`,
      hours: day ? `${day.opens} – ${day.closes}` : null
    }
  })
}
