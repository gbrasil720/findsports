import {
  createOnsideEmailTemplate,
  type EmailBlock
} from '@findsports_oficial/auth/email-layout'
import { sendEmail } from '@findsports_oficial/auth/verification-email'
import { and, db, eq, sql } from '@findsports_oficial/db'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'
import { barNotice } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'

import { getBarNumbers } from './commercial-analytics/queries'
import { gameTitle } from './game-participants'

/**
 * Avisos por e-mail ao dono do bar (WEB-441, design 2b): o resumo da semana,
 * o jogo lotando e a grade vazia. Cada um se liga e desliga em Configurações
 * → Avisos (colunas `notice_*` de `bar`). Textos e limiares são os do design,
 * não validados com o dono.
 *
 * - Resumo e grade vazia saem às segundas, no cron diário (`runScheduledJobs`,
 *   01:00 de Brasília), sobre a semana de segunda a domingo. Com os dois
 *   ligados e a semana vazia vai só o resumo, que já diz "nenhum jogo" e leva
 *   a "Cadastrar jogos": dois e-mails na mesma madrugada seriam um a mais.
 * - Jogo lotando sai na marcação que passa de `GAME_FILLING_THRESHOLD`, uma
 *   vez por jogo.
 *
 * `bar_notice` garante que cada aviso sai uma vez, mesmo com o cron rodando
 * de novo pelo Houdini.
 */

/** "Mais de 20 pessoas marcaram que vão" (2b). */
export const GAME_FILLING_THRESHOLD = 20

type Email = { subject: string; html: string; text: string }
type Game = {
  id: string
  title: string
  startsAt: Date
  championship?: string | null
}

const appUrl = (path: string) =>
  new URL(path, env.PUBLIC_APP_URL ?? env.BETTER_AUTH_URL).toString()

const hello = (name: string) => (name.trim() ? `Olá, ${name.trim()}.` : 'Olá.')

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

const DAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  day: '2-digit',
  month: '2-digit'
})

/** "qua., 28/10, 21:30", no relógio de Brasília. */
const WHEN = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

const OPT_OUT =
  'desligue em Configurações, na parte de Avisos, no painel do bar.'

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  weekday: 'short'
})
const MONTH_DAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  day: '2-digit'
})
const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit'
})
const NUMBER = new Intl.NumberFormat('pt-BR')
const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact' })

/**
 * "1.204" até 9.999; daí "12 mil", "1,2 mi": três números de 32 px lado a
 * lado não cabem a 375 px com mais de cinco caracteres. O espaço do Intl é
 * o que não quebra; o comum deixa o "mil" descer quando não cabe.
 */
export const statNumber = (n: number) =>
  (n < 10_000 ? NUMBER : COMPACT).format(n).replace('\u00a0', ' ')

/** "QUA", como na caixa do dia do desenho. */
const weekday = (date: Date) =>
  WEEKDAY.format(date).replace('.', '').toUpperCase()

/** Os avisos do bar (2b, WEB-477): etiqueta e link para desligar. */
const BAR_NOTICE = {
  tag: 'PAINEL DO BAR',
  noteTag: 'AVISOS',
  optOut: () => ({
    label: 'Desligar em Configurações › Avisos',
    url: appUrl('/admin/configuracoes#avisos')
  })
}

/** A semana que começa em `start`, dia a dia, em branco. */
function emptyWeek(
  current: { start: Date; end: Date },
  extra: { label?: string; note?: string } = {}
): EmailBlock {
  const days = Array.from({ length: 7 }, (_, k) => {
    const day = new Date(current.start.getTime() + k * 86_400_000)
    return { weekday: weekday(day), day: MONTH_DAY.format(day) }
  })
  return { kind: 'week', days, ...extra }
}

/**
 * A semana de Brasília de `now`, de segunda a domingo: a segunda ("2026-10-26",
 * a referência do aviso), o começo dela e da próxima, e o começo da anterior.
 */
export function brasiliaWeek(now: Date) {
  const today = brasiliaDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const monday = brasiliaDay(`${today}T12:00:00Z`, -((weekday + 6) % 7))
  const shift = (days: number) =>
    brasiliaDayStart(brasiliaDay(`${monday}T12:00:00Z`, days))
  return {
    monday,
    isMonday: today === monday,
    start: shift(0),
    end: shift(7),
    previousStart: shift(-7)
  }
}

/** Qual aviso da segunda o bar recebe, se algum. */
export function weeklyNoticeFor(input: {
  weeklySummary: boolean
  emptySchedule: boolean
  games: number
}): 'weekly_summary' | 'empty_schedule' | null {
  if (input.weeklySummary) return 'weekly_summary'
  if (input.emptySchedule && input.games === 0) return 'empty_schedule'
  return null
}

/** "de 19/10 a 25/10": `start` até o dia anterior a `end`. */
function range(start: Date, end: Date) {
  return `de ${DAY.format(start)} a ${DAY.format(new Date(end.getTime() - 1))}`
}

/** Até quatro jogos na agenda, e o resto contado. */
function gameList(label: string, games: Game[]): EmailBlock {
  const rest = games.length - 4
  return {
    kind: 'games',
    label,
    items: games.slice(0, 4).map((game) => ({
      weekday: weekday(game.startsAt),
      day: DAY.format(game.startsAt),
      title: game.title,
      // Jogo sem times já tem o campeonato no título.
      detail: [TIME.format(game.startsAt), game.championship]
        .filter((part) => part && part !== game.title)
        .join(' · ')
    })),
    ...(rest > 0
      ? { more: `e mais ${plural(rest, 'outro jogo', 'outros jogos')}.` }
      : {})
  }
}

export function createWeeklySummaryEmail(input: {
  owner: string
  barName: string
  /** A semana que passou e a que começa. */
  previous: { start: Date; end: Date }
  current: { start: Date; end: Date }
  numbers: { going: number; validatedCodes: number; profileViews: number }
  /** Presenças e códigos só saem para o Elite, como no painel. */
  elite: boolean
  games: Game[]
}): Email {
  const { numbers } = input
  const stat = (n: number, one: string, many: string) => ({
    value: statNumber(n),
    label: n === 1 ? one : many
  })
  const week = range(input.current.start, input.current.end)
  const label = `NESTA SEMANA · ${week.toUpperCase()}`
  const template = createOnsideEmailTemplate({
    tag: BAR_NOTICE.tag,
    eyebrow: `${input.barName.trim().toUpperCase()} · ${range(input.previous.start, input.previous.end).toUpperCase()}`,
    heading: 'Resumo da',
    headingAccent: 'semana',
    intro: `${hello(input.owner)} Veja como foi a semana ${range(input.previous.start, input.previous.end)} na Onside e o que vem pela frente.`,
    blocks: [
      {
        kind: 'stats',
        items: [
          ...(input.elite
            ? [
                stat(
                  numbers.going,
                  'pessoa marcou que ia aos seus jogos',
                  'pessoas marcaram que iam aos seus jogos'
                ),
                stat(
                  numbers.validatedCodes,
                  'código validado no balcão',
                  'códigos validados no balcão'
                )
              ]
            : []),
          stat(
            numbers.profileViews,
            'vez que o perfil do bar foi aberto',
            'vezes que o perfil do bar foi aberto'
          )
        ]
      },
      input.games.length
        ? gameList(label, input.games)
        : emptyWeek(input.current, {
            label,
            note: `Nenhum jogo na agenda desta semana, ${week}.`
          })
    ],
    ...(input.games.length
      ? { action: 'Abrir o painel', actionUrl: appUrl('/admin') }
      : {
          action: 'Cadastrar jogos',
          actionUrl: appUrl('/admin/jogos?novo=1')
        }),
    noteTag: BAR_NOTICE.noteTag,
    note: `Para não receber mais este resumo, ${OPT_OUT}`,
    reason:
      'Você recebeu este e-mail porque o resumo semanal está ligado na conta do bar na Onside.',
    optOut: BAR_NOTICE.optOut()
  })
  return { subject: `Resumo da semana: ${input.barName}`, ...template }
}

export function createEmptyScheduleEmail(input: {
  owner: string
  current: { start: Date; end: Date }
}): Email {
  const template = createOnsideEmailTemplate({
    tag: BAR_NOTICE.tag,
    heading: 'Semana',
    headingAccent: 'sem jogos',
    shadow: 'ink',
    intro: `${hello(input.owner)} Seu bar não tem nenhum jogo na agenda desta semana, ${range(input.current.start, input.current.end)}.`,
    blocks: [emptyWeek(input.current)],
    steps: [
      'Com jogo na agenda, o bar aparece para quem procura onde assistir àquele jogo.'
    ],
    action: 'Cadastrar jogos',
    actionUrl: appUrl('/admin/jogos?novo=1'),
    noteTag: BAR_NOTICE.noteTag,
    note: `Para não receber mais este lembrete, ${OPT_OUT}`,
    reason:
      'Você recebeu este e-mail porque o aviso de grade vazia está ligado na conta do bar na Onside.',
    optOut: BAR_NOTICE.optOut()
  })
  return { subject: 'Nenhum jogo na agenda desta semana', ...template }
}

export function createGameFillingEmail(input: {
  owner: string
  game: Game
}): Email {
  const template = createOnsideEmailTemplate({
    tag: BAR_NOTICE.tag,
    heading: 'Jogo',
    headingAccent: 'lotando',
    intro: `${hello(input.owner)} Mais de ${GAME_FILLING_THRESHOLD} pessoas marcaram na Onside que vão assistir a ${input.game.title} no seu bar, ${WHEN.format(input.game.startsAt)}.`,
    blocks: [
      {
        kind: 'ticket',
        tag: [input.game.championship?.toUpperCase(), 'NO SEU BAR']
          .filter(Boolean)
          .join(' · '),
        title: input.game.title,
        when: WHEN.format(input.game.startsAt).toUpperCase(),
        number: `${GAME_FILLING_THRESHOLD}+`,
        label: 'pessoas marcaram que vão assistir aqui'
      }
    ],
    action: 'Ver o jogo no painel',
    actionUrl: appUrl(`/admin/jogos?jogo=${input.game.id}`),
    noteTag: BAR_NOTICE.noteTag,
    note: `Avisamos uma vez por jogo. Para não receber mais este aviso, ${OPT_OUT}`,
    reason:
      'Você recebeu este e-mail porque o aviso de jogo lotando está ligado na conta do bar na Onside.',
    optOut: BAR_NOTICE.optOut()
  })
  return { subject: `Jogo lotando: ${input.game.title}`, ...template }
}

type Notice = typeof barNotice.$inferInsert

/**
 * Grava o aviso e só manda se a linha entrou. Envio que falha apaga a linha,
 * para a próxima rodada tentar de novo, e a falha sobe.
 */
async function sendOnce(notice: Notice, to: string, email: Email) {
  const [claimed] = await db
    .insert(barNotice)
    .values(notice)
    .onConflictDoNothing()
    .returning({ barId: barNotice.barId })
  if (!claimed) return false
  try {
    await sendEmail({
      apiKey: env.EMAIL_API_KEY,
      fromEmail: env.EMAIL_FROM,
      to,
      ...email
    })
    return true
  } catch (error) {
    await db
      .delete(barNotice)
      .where(
        and(
          eq(barNotice.barId, notice.barId),
          eq(barNotice.kind, notice.kind),
          eq(barNotice.ref, notice.ref)
        )
      )
    throw error
  }
}

const titleSql = gameTitle({
  id: sql`e.id`,
  participantFreeText: sql`e.participant_free_text`,
  championship: sql`e.championship`
})

/**
 * Os avisos da segunda (resumo e grade vazia) dos bares no ar. Fora da
 * segunda não faz nada: rodar de novo no mesmo dia não repete e-mail
 * (`bar_notice`), e numa quinta mandaria "o resumo da semana" no meio dela.
 * Um envio que falha não para os outros; no fim, a falha sobe para o
 * `job_run` e o cron marcarem.
 */
export async function sendWeeklyBarNotices(now = new Date()) {
  const week = brasiliaWeek(now)
  if (!week.isMonday) return { weeklySummaries: 0, emptySchedules: 0 }

  const bars = await db.execute<{
    id: string
    name: string
    plan: string
    weekly_summary: boolean
    empty_schedule: boolean
    email: string
    owner: string
  }>(sql`
    SELECT b.id, b.name, b.plan, u.email, u.name AS owner,
      b.notice_weekly_summary AS weekly_summary,
      b.notice_empty_schedule AS empty_schedule
    FROM bar b
    JOIN "user" u ON u.id = b.user_id
    WHERE b.is_active
      AND (b.notice_weekly_summary OR b.notice_empty_schedule)
  `)
  // `starts_at` é `timestamp` guardando UTC: vira instante antes de comparar.
  const games = await db.execute<{
    bar_id: string
    id: string
    title: string
    championship: string
    starts_at: string | Date
  }>(sql`
    SELECT e.bar_id, e.id, ${titleSql} AS title, e.championship,
      (e.starts_at AT TIME ZONE 'UTC') AS starts_at
    FROM event e
    JOIN bar b ON b.id = e.bar_id
    WHERE b.is_active
      AND e.published_at IS NOT NULL
      AND (e.starts_at AT TIME ZONE 'UTC') >= ${week.start.toISOString()}::timestamptz
      AND (e.starts_at AT TIME ZONE 'UTC') < ${week.end.toISOString()}::timestamptz
    ORDER BY e.starts_at
  `)
  const gamesByBar = new Map<string, Game[]>()
  for (const row of games.rows) {
    const list = gamesByBar.get(row.bar_id) ?? []
    list.push({
      id: row.id,
      title: row.title,
      championship: row.championship,
      startsAt: new Date(row.starts_at)
    })
    gamesByBar.set(row.bar_id, list)
  }

  const counts = { weeklySummaries: 0, emptySchedules: 0 }
  const failures: string[] = []
  for (const row of bars.rows) {
    const list = gamesByBar.get(row.id) ?? []
    const kind = weeklyNoticeFor({
      weeklySummary: row.weekly_summary,
      emptySchedule: row.empty_schedule,
      games: list.length
    })
    if (!kind) continue
    try {
      const current = { start: week.start, end: week.end }
      const email =
        kind === 'weekly_summary'
          ? createWeeklySummaryEmail({
              owner: row.owner,
              barName: row.name,
              previous: { start: week.previousStart, end: week.start },
              current,
              numbers: await getBarNumbers(
                row.id,
                week.previousStart,
                week.start
              ),
              elite: row.plan === 'elite',
              games: list
            })
          : createEmptyScheduleEmail({ owner: row.owner, current })
      const sent = await sendOnce(
        { barId: row.id, kind, ref: week.monday },
        row.email,
        email
      )
      if (sent && kind === 'weekly_summary') counts.weeklySummaries++
      if (sent && kind === 'empty_schedule') counts.emptySchedules++
    } catch (error) {
      failures.push(row.id)
      console.error(
        JSON.stringify({
          evt: 'bar_notice_failed',
          kind,
          barId: row.id,
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }
  }
  if (failures.length) {
    throw new Error(
      `${plural(failures.length, 'aviso da semana não saiu', 'avisos da semana não saíram')} (enviados: ${counts.weeklySummaries + counts.emptySchedules}).`
    )
  }
  return counts
}

type Executor = Pick<typeof db, 'execute'>

/**
 * A marcação que acabou de entrar fez o jogo passar do limite, o aviso está
 * ligado e ainda não saiu. Roda na transação do `setAttendance`, que já vê a
 * própria marcação.
 */
export async function gameFillingDue(eventId: string, tx: Executor) {
  const result = await tx.execute(sql`
    SELECT 1
    FROM event e
    JOIN bar b ON b.id = e.bar_id
    WHERE e.id = ${eventId}
      AND b.notice_game_filling
      AND (SELECT count(*) FROM attendance a WHERE a.event_id = e.id)
        > ${GAME_FILLING_THRESHOLD}
      AND NOT EXISTS (
        SELECT 1 FROM bar_notice n
        WHERE n.bar_id = e.bar_id AND n.kind = 'game_filling' AND n.ref = e.id
      )
  `)
  return result.rows.length > 0
}

/** Manda o "Jogo lotando" de `eventId`, uma vez. Falha só vai ao log. */
export async function notifyGameFilling(eventId: string) {
  try {
    const result = await db.execute<{
      bar_id: string
      title: string
      championship: string
      starts_at: string | Date
      email: string
      owner: string
    }>(sql`
      SELECT e.bar_id, ${titleSql} AS title, e.championship,
        (e.starts_at AT TIME ZONE 'UTC') AS starts_at,
        u.email, u.name AS owner
      FROM event e
      JOIN bar b ON b.id = e.bar_id
      JOIN "user" u ON u.id = b.user_id
      WHERE e.id = ${eventId} AND b.notice_game_filling
    `)
    const row = result.rows[0]
    if (!row) return false
    return await sendOnce(
      { barId: row.bar_id, kind: 'game_filling', ref: eventId },
      row.email,
      createGameFillingEmail({
        owner: row.owner,
        game: {
          id: eventId,
          title: row.title,
          championship: row.championship,
          startsAt: new Date(row.starts_at)
        }
      })
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        evt: 'bar_notice_failed',
        kind: 'game_filling',
        eventId,
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return false
  }
}
