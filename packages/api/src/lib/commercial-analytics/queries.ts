import type { SubscriptionPlan } from '@findsports_oficial/db'
import { db, sql } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import type {
  AnalyticsOverview,
  DailyDataPoint,
  EventAnalyticsResponse,
  EventAnalyticsRow
} from './types'
import { pctChange } from './types'

/**
 * Resolve bar ID and subscription plan from user ID.
 * Single source for bar+plan resolution — used by all analytics procedures.
 */
export async function resolveBarAndPlan(
  userId: string
): Promise<{ barId: string; plan: SubscriptionPlan }> {
  const result = await db.execute(sql`
    SELECT b.id, s.plan
    FROM bar b
    LEFT JOIN subscription s ON s.bar_id = b.id
    WHERE b.user_id = ${userId}
    LIMIT 1
  `)
  const row = result.rows[0] as
    | { id: string; plan: SubscriptionPlan | null }
    | undefined

  if (!row) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado'
    })
  }

  return {
    barId: row.id,
    plan: (row.plan ?? 'starter') as SubscriptionPlan
  }
}

/** Uma linha por dia, com os quatro tipos já separados. */
type DailyRow = {
  date: string
  profile_view: number
  directions_opened: number
  phone_clicked: number
  whatsapp_opened: number
}

/**
 * Preenche os dias sem evento com zero. O gráfico precisa da série contínua;
 * o banco só devolve os dias que existem.
 */
function fillGaps(
  rows: DailyRow[],
  field: keyof Omit<DailyRow, 'date'>,
  start: Date,
  end: Date
): DailyDataPoint[] {
  const porDia = new Map(rows.map((r) => [r.date, Number(r[field] ?? 0)]))
  const series: DailyDataPoint[] = []
  const cursor = new Date(start)
  const limite = new Date(end)
  while (cursor <= limite) {
    const dateStr = cursor.toISOString().slice(0, 10)
    series.push({ date: dateStr, value: porDia.get(dateStr) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return series
}

/**
 * Compute the previous period range given a current range.
 */
function previousPeriodRange(from: Date, to: Date): { start: Date; end: Date } {
  const durationMs = to.getTime() - from.getTime()
  const prevEnd = new Date(from)
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return { start: prevStart, end: prevEnd }
}

/**
 * GetMyAnalyticsOverview: aggregate analytics for a bar's date range.
 * Tenant-safe: bar_id derived from session.
 *
 * Por que NÃO lê das tabelas de rollup, apesar de o relatório original ter
 * sugerido isso: cinco das sete métricas são somáveis por dia, mas
 * `unique_visitors` e `interested_people` são contagens distintas. Somar o
 * valor diário contaria duas vezes quem voltou em dias diferentes, e o painel
 * passaria a mostrar um número maior do que a realidade — silenciosamente.
 *
 * Os eventos brutos continuam sendo a fonte da verdade e dão a resposta
 * exata numa passagem só. Os rollups voltam a ser a origem certa quando
 * existir a poda de eventos brutos (ESC-10): aí o período longo deixará de
 * ter dado bruto para consultar, e a perda de precisão nas duas métricas
 * distintas passa a ser uma escolha consciente, não um efeito colateral.
 */
export async function getMyAnalyticsOverview(
  barId: string,
  from: Date,
  to: Date
): Promise<AnalyticsOverview> {
  const prev = previousPeriodRange(from, to)

  // ESC-07: eram 16 consultas — quatro contagens do período, quatro do
  // período anterior, duas de visitantes únicos, duas de interessados e
  // quatro quebras diárias — todas varrendo `bar_commercial_event`.
  //
  // Agora é uma só. A janela lida vai do início do período anterior até o
  // fim do atual, e `FILTER` separa os dois períodos e os quatro tipos numa
  // única passagem. A série diária volta como JSON na mesma resposta.
  const HIGH_INTENT = sql`('directions_opened', 'phone_clicked', 'whatsapp_opened')`
  const noPeriodoAtual = sql`occurred_at >= ${from} AND occurred_at <= ${to}`
  const noPeriodoAnterior = sql`occurred_at >= ${prev.start} AND occurred_at <= ${prev.end}`

  const result = await db.execute(sql`
    WITH eventos AS (
      SELECT type, actor_user_id, occurred_at, commercial_day
      FROM bar_commercial_event
      WHERE bar_id = ${barId}
        AND occurred_at >= ${prev.start}
        AND occurred_at <= ${to}
    ),
    diario AS (
      SELECT
        commercial_day::text AS date,
        COUNT(*) FILTER (WHERE type = 'profile_view')      AS profile_view,
        COUNT(*) FILTER (WHERE type = 'directions_opened') AS directions_opened,
        COUNT(*) FILTER (WHERE type = 'phone_clicked')     AS phone_clicked,
        COUNT(*) FILTER (WHERE type = 'whatsapp_opened')   AS whatsapp_opened
      FROM eventos
      WHERE ${noPeriodoAtual}
      GROUP BY commercial_day
    )
    SELECT
      COUNT(*) FILTER (WHERE type = 'profile_view'      AND ${noPeriodoAtual})     AS profile_views,
      COUNT(*) FILTER (WHERE type = 'directions_opened' AND ${noPeriodoAtual})     AS directions_opened,
      COUNT(*) FILTER (WHERE type = 'phone_clicked'     AND ${noPeriodoAtual})     AS phone_clicked,
      COUNT(*) FILTER (WHERE type = 'whatsapp_opened'   AND ${noPeriodoAtual})     AS whatsapp_opened,
      COUNT(*) FILTER (WHERE type = 'profile_view'      AND ${noPeriodoAnterior})  AS profile_views_prev,
      COUNT(*) FILTER (WHERE type = 'directions_opened' AND ${noPeriodoAnterior})  AS directions_opened_prev,
      COUNT(*) FILTER (WHERE type = 'phone_clicked'     AND ${noPeriodoAnterior})  AS phone_clicked_prev,
      COUNT(*) FILTER (WHERE type = 'whatsapp_opened'   AND ${noPeriodoAnterior})  AS whatsapp_opened_prev,
      -- Contagens distintas sobre o período inteiro: quem visita em dois dias
      -- conta uma vez só. É por isso que elas não podem sair da soma dos
      -- rollups diários (ver comentário abaixo).
      COUNT(DISTINCT actor_user_id) FILTER (WHERE type = 'profile_view' AND ${noPeriodoAtual})    AS unique_visitors,
      COUNT(DISTINCT actor_user_id) FILTER (WHERE type = 'profile_view' AND ${noPeriodoAnterior}) AS unique_visitors_prev,
      COUNT(DISTINCT actor_user_id) FILTER (WHERE type IN ${HIGH_INTENT} AND ${noPeriodoAtual})    AS interested_people,
      COUNT(DISTINCT actor_user_id) FILTER (WHERE type IN ${HIGH_INTENT} AND ${noPeriodoAnterior}) AS interested_people_prev,
      (SELECT COALESCE(json_agg(d ORDER BY d.date), '[]'::json) FROM diario d) AS diario
    FROM eventos
  `)

  const row = result.rows[0] as Record<string, string | DailyRow[] | null>
  const n = (campo: string) => Number(row[campo] ?? 0)

  const profileViews = n('profile_views')
  const directionsOpened = n('directions_opened')
  const phoneClicked = n('phone_clicked')
  const whatsappOpened = n('whatsapp_opened')
  const profileViewsPrev = n('profile_views_prev')
  const directionsOpenedPrev = n('directions_opened_prev')
  const phoneClickedPrev = n('phone_clicked_prev')
  const whatsappOpenedPrev = n('whatsapp_opened_prev')
  const uniqueVisitors = n('unique_visitors')
  const uniqueVisitorsPrev = n('unique_visitors_prev')
  const interestedPeople = n('interested_people')
  const interestedPeoplePrev = n('interested_people_prev')

  const highIntentActions = directionsOpened + phoneClicked + whatsappOpened
  const highIntentActionsPrev =
    directionsOpenedPrev + phoneClickedPrev + whatsappOpenedPrev

  const diario = (row.diario as DailyRow[] | null) ?? []
  const dailyProfileViews = fillGaps(diario, 'profile_view', from, to)
  const dailyDirectionsOpened = fillGaps(diario, 'directions_opened', from, to)
  const dailyPhoneClicked = fillGaps(diario, 'phone_clicked', from, to)
  const dailyWhatsappOpened = fillGaps(diario, 'whatsapp_opened', from, to)

  return {
    uniqueVisitors,
    interestedPeople,
    highIntentActions,
    profileViews,
    directionsOpened,
    phoneClicked,
    whatsappOpened,
    uniqueVisitorsPrev,
    interestedPeoplePrev,
    highIntentActionsPrev,
    profileViewsPrev,
    directionsOpenedPrev,
    phoneClickedPrev,
    whatsappOpenedPrev,
    uniqueVisitorsChange: pctChange(uniqueVisitors, uniqueVisitorsPrev),
    interestedPeopleChange: pctChange(interestedPeople, interestedPeoplePrev),
    highIntentActionsChange: pctChange(
      highIntentActions,
      highIntentActionsPrev
    ),
    profileViewsChange: pctChange(profileViews, profileViewsPrev),
    directionsOpenedChange: pctChange(directionsOpened, directionsOpenedPrev),
    phoneClickedChange: pctChange(phoneClicked, phoneClickedPrev),
    whatsappOpenedChange: pctChange(whatsappOpened, whatsappOpenedPrev),
    dailyProfileViews,
    dailyDirectionsOpened,
    dailyPhoneClicked,
    dailyWhatsappOpened,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
}

/**
 * GetMyEventAnalytics: per-event breakdown for a bar within a date range.
 * Tenant-safe: events filtered by bar_id derived from session.
 */
export async function getMyEventAnalytics(
  barId: string,
  from: Date,
  to: Date
): Promise<EventAnalyticsResponse> {
  const result = await db.execute(sql`
    SELECT
      e.id AS event_id,
      COALESCE(e.championship || ' - ', '') || 'Evento' AS event_name,
      e.starts_at,
      COUNT(CASE WHEN bce.type = 'profile_view' THEN 1 END) AS profile_views,
      COUNT(CASE WHEN bce.type = 'directions_opened' THEN 1 END) AS directions_opened,
      COUNT(CASE WHEN bce.type = 'phone_clicked' THEN 1 END) AS phone_clicked,
      COUNT(CASE WHEN bce.type = 'whatsapp_opened' THEN 1 END) AS whatsapp_opened
    FROM event e
    LEFT JOIN bar_commercial_event bce
      ON bce.source_event_id = e.id AND bce.bar_id = ${barId}
      AND bce.occurred_at >= ${from} AND bce.occurred_at <= ${to}
    WHERE e.bar_id = ${barId}
      AND e.starts_at >= ${from}
      AND e.starts_at <= ${to}
    GROUP BY e.id, e.championship, e.starts_at
    ORDER BY e.starts_at DESC
  `)

  const events: EventAnalyticsRow[] = (
    result.rows as Array<{
      event_id: string
      event_name: string
      starts_at: string
      profile_views: string
      directions_opened: string
      phone_clicked: string
      whatsapp_opened: string
    }>
  ).map((row) => ({
    eventId: row.event_id,
    eventName: row.event_name,
    startsAt: row.starts_at,
    profileViews: Number(row.profile_views),
    directionsOpened: Number(row.directions_opened),
    phoneClicked: Number(row.phone_clicked),
    whatsappOpened: Number(row.whatsapp_opened)
  }))

  return {
    events,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
}
