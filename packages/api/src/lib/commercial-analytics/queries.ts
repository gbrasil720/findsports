import type { SubscriptionPlan } from '@findsports_oficial/db'
import { db, sql } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { getCommercialDay } from './commercial-day'
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
 * Uma linha do rollup diário finalizado que substitui um dia podado (WEB-98).
 * A poda apaga o dia inteiro de um bar (ESC-10), então um dia finalizado sem
 * evento bruto é exatamente um dia podado — e é o único caso em que o rollup
 * entra como origem nas leituras.
 */
type RollupDailyRow = {
  date: string
  unique_visitors: number
  interested_people: number
  profile_views: number
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
 * Dias do período já podados: rollup diário finalizado sem evento bruto.
 *
 * A retenção (ESC-10/WEB-98) só apaga o dia inteiro de um bar e depois de
 * finalizar o rollup daquele dia. Então a ausência total de brutos num dia
 * finalizado é a assinatura exata de um dia podado — nenhum outro fluxo de
 * escrita produz esse estado. São esses dias que voltam pelo rollup em vez da
 * contagem exata sobre os brutos.
 */
async function buscarDiasPodados(
  barId: string,
  prev: { start: Date; end: Date },
  to: Date
): Promise<RollupDailyRow[]> {
  const result = await db.execute(sql`
    SELECT
      r.commercial_day::text AS date,
      r.unique_visitors,
      r.interested_people,
      r.profile_views,
      r.directions_opened,
      r.phone_clicked,
      r.whatsapp_opened
    FROM bar_commercial_daily_rollup r
    WHERE r.bar_id = ${barId}
      AND r.is_finalized = true
      AND r.commercial_day >= ${getCommercialDay(prev.start)}::date
      AND r.commercial_day <= ${getCommercialDay(to)}::date
      AND NOT EXISTS (
        SELECT 1
        FROM bar_commercial_event e
        WHERE e.bar_id = r.bar_id
          AND e.commercial_day = r.commercial_day
      )
    ORDER BY r.commercial_day
  `)

  return (
    result.rows as Array<{
      date: string
      unique_visitors: string
      interested_people: string
      profile_views: string
      directions_opened: string
      phone_clicked: string
      whatsapp_opened: string
    }>
  ).map((row) => ({
    date: row.date,
    unique_visitors: Number(row.unique_visitors),
    interested_people: Number(row.interested_people),
    profile_views: Number(row.profile_views),
    directions_opened: Number(row.directions_opened),
    phone_clicked: Number(row.phone_clicked),
    whatsapp_opened: Number(row.whatsapp_opened)
  }))
}

/**
 * GetMyAnalyticsOverview: aggregate analytics for a bar's date range.
 * Tenant-safe: bar_id derived from session.
 *
 * Duas origens, com o bruto sempre na frente:
 * - dias com evento bruto: os brutos são a fonte exata — contagens somáveis e
 *   contagens distintas do período inteiro, numa passagem só (ESC-07);
 * - dias podados (rollup finalizado sem evento bruto, WEB-98): o rollup diário
 *   finalizado substitui o bruto que a retenção apagou, para o período antigo
 *   continuar a aparecer no painel em vez de virar zero.
 *
 * A perda de precisão fica restrita às duas contagens distintas
 * (`unique_visitors` e `interested_people`) de um período que contenha dia
 * podado: o valor passa a ser o distinto de cada dia somado — quem voltou em
 * dois dias entra duas vezes, inclusive no limite entre dia bruto e dia
 * podado. Enquanto o período inteiro ainda tem bruto (o caso comum hoje), a
 * leitura continua exata, contando cada pessoa uma vez só.
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

  let profileViews = n('profile_views')
  let directionsOpened = n('directions_opened')
  let phoneClicked = n('phone_clicked')
  let whatsappOpened = n('whatsapp_opened')
  let profileViewsPrev = n('profile_views_prev')
  let directionsOpenedPrev = n('directions_opened_prev')
  let phoneClickedPrev = n('phone_clicked_prev')
  let whatsappOpenedPrev = n('whatsapp_opened_prev')
  let uniqueVisitors = n('unique_visitors')
  let uniqueVisitorsPrev = n('unique_visitors_prev')
  let interestedPeople = n('interested_people')
  let interestedPeoplePrev = n('interested_people_prev')

  const diario: DailyRow[] = (row.diario as DailyRow[] | null) ?? []

  // WEB-98: dias podados voltam pelos rollups finalizados — ver o comentário
  // do cabeçalho desta função para a precisão esperada nas contagens distintas.
  const diasPodados = await buscarDiasPodados(barId, prev, to)
  if (diasPodados.length > 0) {
    const atualIni = getCommercialDay(from)
    const atualFim = getCommercialDay(to)
    const anteriorIni = getCommercialDay(prev.start)
    const anteriorFim = getCommercialDay(prev.end)

    for (const dia of diasPodados) {
      const noAtual = dia.date >= atualIni && dia.date <= atualFim
      const noAnterior = dia.date >= anteriorIni && dia.date <= anteriorFim

      if (noAtual) {
        profileViews += dia.profile_views
        directionsOpened += dia.directions_opened
        phoneClicked += dia.phone_clicked
        whatsappOpened += dia.whatsapp_opened
        uniqueVisitors += dia.unique_visitors
        interestedPeople += dia.interested_people
      }
      if (noAnterior) {
        profileViewsPrev += dia.profile_views
        directionsOpenedPrev += dia.directions_opened
        phoneClickedPrev += dia.phone_clicked
        whatsappOpenedPrev += dia.whatsapp_opened
        uniqueVisitorsPrev += dia.unique_visitors
        interestedPeoplePrev += dia.interested_people
      }

      diario.push({
        date: dia.date,
        profile_view: dia.profile_views,
        directions_opened: dia.directions_opened,
        phone_clicked: dia.phone_clicked,
        whatsapp_opened: dia.whatsapp_opened
      })
    }
  }

  const highIntentActions = directionsOpened + phoneClicked + whatsappOpened
  const highIntentActionsPrev =
    directionsOpenedPrev + phoneClickedPrev + whatsappOpenedPrev
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
 *
 * Quebra por evento não dá para reconstruir a partir dos rollups diários —
 * eles não têm dimensão de evento (WEB-98). Depois de podar os brutos de um
 * dia, os eventos daquele dia continuam listados (a tabela `event` nunca é
 * podada), mas as contagens refletem apenas os brutos que sobreviveram. É o
 * limite de precisão documentado do contrato: a retenção de brutos sacrifica
 * a atribuição histórica por evento em troca do agregado diário finalizado.
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
