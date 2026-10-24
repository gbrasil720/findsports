import { and, db, eq, sql } from '@findsports_oficial/db'
import { getEventEnd } from '@findsports_oficial/db/event-window'
import {
  eventEndedSql,
  eventEndSql,
  utcNowSql
} from '@findsports_oficial/db/event-window-sql'
import { attendanceReport } from '@findsports_oficial/db/schema/attendance'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { TRPCError } from '@trpc/server'
import { readAttendanceQuestions } from './attendance'
import { participantNames } from './game-participants'
import { RATING_WINDOW_DAYS } from './rating'
import type { RatingReasonId } from './rating-reasons'
import { utcIso } from './utc-timestamp'

/*
 * Pós-jogo (3g do design, WEB-128 e a avaliação): "Você foi?" e "Voltaria?"
 * são duas perguntas do mesmo momento, sobre o mesmo jogo. Aqui elas viram
 * uma fila só, com um item por jogo, e uma resposta que grava as duas numa
 * transação. As regras de cada uma continuam as delas: a presença só se
 * pergunta a quem marcou "Vou assistir aqui" (`readAttendanceQuestions`); a
 * nota, a quem mostrou intenção de ir (`checkEligibility`). E quem diz que
 * não foi não avalia: "Voltaria?" é de quem esteve lá.
 */

/**
 * Tipos de evento comercial que contam como intenção de ir. Marcar "Vou
 * assistir aqui" (`attendance`) também conta, e é a intenção mais explícita.
 *
 * `profile_view` fica de fora: abrir a página de um bar não é dizer que você
 * pensou em ir lá. Sem esse corte, qualquer pessoa que passou os olhos num
 * perfil ganharia direito de avaliar o bar — e a avaliação valeria tanto
 * quanto a de quem nunca saiu de casa.
 */
const INTENT_TYPES = [
  'directions_opened',
  'whatsapp_opened',
  'phone_clicked'
] as const

const RATING_WINDOW_MS = RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000

/**
 * O torcedor pode avaliar o bar deste jogo?
 *
 * Três condições, todas verificadas no servidor porque todas são a diferença
 * entre uma nota que significa alguma coisa e um placar de popularidade:
 *
 *   1. ele demonstrou intenção de ir — marcou "Vou assistir aqui" naquele
 *      jogo, ou abriu rota, WhatsApp ou telefone DAQUELE bar, para AQUELE
 *      jogo (`bar_commercial_event`, com `actor_user_id` e
 *      `source_event_id`);
 *   2. o jogo já acabou. Avaliar antes seria avaliar expectativa;
 *   3. faz menos de `RATING_WINDOW_DAYS` que acabou. Depois disso é memória,
 *      não observação — e é onde mora a avaliação movida por raiva acumulada.
 *
 * Devolve o motivo da recusa em vez de um booleano: quem chama precisa saber
 * a diferença entre "ainda não pode" e "não pode mais".
 */
async function checkEligibility(input: {
  userId: string
  /** O bar que o cliente diz; sem ele, o do jogo. */
  barId?: string
  eventId: string
  now: Date
}): Promise<{ ok: true; barId: string } | { ok: false; reason: string }> {
  const rows = await db.execute(sql`
    SELECT
      e.bar_id,
      e.starts_at,
      e.ends_at,
      b.is_active,
      EXISTS (
        SELECT 1 FROM bar_commercial_event ce
        WHERE ce.bar_id = e.bar_id
          AND ce.actor_user_id = ${input.userId}
          AND ce.source_event_id = ${input.eventId}
          AND ce.type IN (${sql.join(
            INTENT_TYPES.map((type) => sql`${type}`),
            sql`, `
          )})
      ) OR EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.user_id = ${input.userId} AND a.event_id = e.id
      ) AS has_intent
    FROM event e
    JOIN bar b ON b.id = e.bar_id
    WHERE e.id = ${input.eventId}
      ${input.barId ? sql`AND e.bar_id = ${input.barId}` : sql``}
  `)

  const row = rows.rows[0] as
    | {
        bar_id: string
        starts_at: string
        ends_at: string | null
        is_active: boolean
        has_intent: boolean
      }
    | undefined

  if (!row) {
    return { ok: false, reason: 'Jogo não encontrado neste bar.' }
  }

  // Como em `readPendingRatings`: bar fora do ar não recebe avaliação.
  if (!row.is_active) {
    return { ok: false, reason: 'Este bar não está no ar.' }
  }

  if (!row.has_intent) {
    return {
      ok: false,
      reason: 'Só quem demonstrou interesse em ir a este jogo pode avaliar.'
    }
  }

  // Sem o `utcIso` a janela de avaliação andava com o fuso do processo.
  const endsAt = getEventEnd({
    startsAt: utcIso(row.starts_at),
    endsAt: row.ends_at ? utcIso(row.ends_at) : null
  })

  if (endsAt.getTime() > input.now.getTime()) {
    return { ok: false, reason: 'O jogo ainda não acabou.' }
  }

  if (input.now.getTime() - endsAt.getTime() > RATING_WINDOW_MS) {
    return {
      ok: false,
      reason: `A avaliação fecha ${RATING_WINDOW_DAYS} dias depois do jogo.`
    }
  }

  return { ok: true, barId: row.bar_id }
}

/**
 * O que este torcedor pode avaliar e ainda não avaliou.
 *
 * A janela e o portão de intenção são os mesmos de `checkEligibility` — mas
 * escritos uma vez só, em SQL, porque aqui a pergunta é "quais", não "este
 * pode".
 */
export async function readPendingRatings(userId: string) {
  const rows = await db.execute(sql`
    WITH intent AS (
      SELECT ce.bar_id, ce.source_event_id AS event_id
      FROM bar_commercial_event ce
      WHERE ce.actor_user_id = ${userId}
        AND ce.type IN (${sql.join(
          INTENT_TYPES.map((type) => sql`${type}`),
          sql`, `
        )})
      UNION
      SELECT ev.bar_id, a.event_id
      FROM attendance a
      JOIN event ev ON ev.id = a.event_id
      WHERE a.user_id = ${userId}
    )
    SELECT DISTINCT ON (e.id)
      e.id AS event_id,
      e.championship,
      e.participant_free_text,
      ${participantNames(sql`e.id`)} AS participants,
      e.starts_at,
      b.id AS bar_id,
      b.name AS bar_name,
      b.neighborhood,
      b.photo_url,
      s.name AS sport_name,
      s.slug AS sport_slug
    FROM intent i
    JOIN event e ON e.id = i.event_id AND e.bar_id = i.bar_id
    JOIN bar b ON b.id = i.bar_id
    JOIN sport s ON s.id = e.sport_id
    WHERE b.is_active
      AND ${eventEndedSql('e')}
      AND ${eventEndSql('e')} > ${utcNowSql()} - ${`${RATING_WINDOW_DAYS} days`}::interval
      AND NOT EXISTS (
        SELECT 1 FROM bar_rating r
        WHERE r.bar_id = i.bar_id
          AND r.actor_user_id = ${userId}
          AND r.event_id = i.event_id
      )
    ORDER BY e.id, e.starts_at DESC
    LIMIT 5
  `)

  return (
    rows.rows as {
      event_id: string
      championship: string
      participant_free_text: string | null
      participants: string[]
      starts_at: string
      bar_id: string
      bar_name: string
      neighborhood: string
      photo_url: string | null
      sport_name: string
      sport_slug: string
    }[]
  ).map((row) => ({
    eventId: row.event_id,
    championship: row.championship,
    participantFreeText: row.participant_free_text,
    participants: row.participants,
    startsAt: utcIso(row.starts_at),
    barId: row.bar_id,
    barName: row.bar_name,
    neighborhood: row.neighborhood,
    photoUrl: row.photo_url,
    sport: { name: row.sport_name, slug: row.sport_slug }
  }))
}

/** Um jogo com pergunta aberta: o que perguntar e o que mostrar. */
export type PostGameItem = {
  eventId: string
  barId: string
  barName: string
  neighborhood: string
  photoUrl: string | null
  championship: string
  participantFreeText: string | null
  participants: string[]
  startsAt: string
  /** "Você foi?" ainda sem resposta; `offer` é a oferta congelada no código. */
  presence: { offer: string | null } | null
  /** "Voltaria?" ainda sem resposta. */
  rating: boolean
}

/**
 * A fila do pós-jogo: um item por jogo, do mais recente ao mais antigo. Quem
 * já respondeu "Não fui" não recebe "Voltaria?".
 */
export async function readPostGame(userId: string): Promise<PostGameItem[]> {
  const [questions, ratings] = await Promise.all([
    readAttendanceQuestions(userId),
    readPendingRatings(userId)
  ])
  const items = new Map<string, PostGameItem>()
  for (const q of questions) {
    if (q.answered) continue
    items.set(q.eventId, {
      eventId: q.eventId,
      barId: q.barId,
      barName: q.barName,
      neighborhood: q.neighborhood,
      photoUrl: q.photoUrl,
      championship: q.championship,
      participantFreeText: q.participantFreeText,
      participants: q.participants,
      startsAt: utcIso(q.startsAt),
      presence: { offer: q.offer },
      rating: false
    })
  }
  const didNotGo = new Set(
    questions.filter((q) => q.attended === false).map((q) => q.eventId)
  )
  for (const { sport: _, ...r } of ratings) {
    if (didNotGo.has(r.eventId)) continue
    const item = items.get(r.eventId)
    items.set(
      r.eventId,
      item ? { ...item, rating: true } : { ...r, presence: null, rating: true }
    )
  }
  return [...items.values()].sort((a, b) =>
    b.startsAt.localeCompare(a.startsAt)
  )
}

export type PostGameAnswer = {
  eventId: string
  /** Só no adaptador antigo (`ratings.submit`): o bar que o cliente diz. */
  barId?: string
  attended?: boolean
  /** Só vale com `attended` e oferta congelada. */
  offerReceived?: boolean
  rating?: { wouldReturn: boolean; reasons: RatingReasonId[] }
}

/**
 * Grava a resposta do pós-jogo: presença, nota ou as duas, numa transação.
 * Responder de novo dentro da janela troca a resposta (a nota não soma
 * outra: a chave é bar, torcedor e jogo). Não toca no registro do bar: as
 * fontes de comparecimento ficam separadas (ADR 0003).
 */
export async function answerPostGame(
  userId: string,
  answer: PostGameAnswer,
  now = new Date()
) {
  const { eventId, attended, rating } = answer
  const [question] = await readAttendanceQuestions(userId, eventId)
  if (attended !== undefined && !question) throw noQuestion()
  // Pergunta que não foi feita não tem resposta gravada.
  const offerReceived =
    question?.offer != null && attended ? (answer.offerReceived ?? null) : null
  let barId: string | null = null
  if (rating) {
    if ((attended ?? question?.attended) === false) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Quem não foi ao jogo não avalia o bar.'
      })
    }
    const eligibility = await checkEligibility({
      userId,
      barId: answer.barId,
      eventId,
      now
    })
    if (!eligibility.ok) {
      throw new TRPCError({ code: 'FORBIDDEN', message: eligibility.reason })
    }
    barId = eligibility.barId
  }
  await db.transaction(async (tx) => {
    if (attended !== undefined) {
      await tx
        .insert(attendanceReport)
        .values({ userId, eventId, attended, offerReceived })
        .onConflictDoUpdate({
          target: [attendanceReport.userId, attendanceReport.eventId],
          set: { attended, offerReceived }
        })
    }
    if (rating && barId) {
      await tx
        .insert(barRating)
        .values({ barId, actorUserId: userId, eventId, ...rating })
        .onConflictDoUpdate({
          target: [barRating.barId, barRating.actorUserId, barRating.eventId],
          set: { ...rating, updatedAt: new Date() }
        })
    }
  })
  return { attended: attended ?? null, offerReceived, rated: Boolean(rating) }
}

/**
 * "Desfazer" do aviso de confirmação (WEB-321): apaga a parte pedida da
 * resposta do próprio torcedor, e a pergunta volta à fila. A presença só
 * enquanto a pergunta vale. Sem resposta gravada não há o que apagar, e não
 * é erro. Nada é materializado a partir da resposta: o alerta interno conta
 * na leitura.
 */
export async function undoPostGame(
  userId: string,
  undo: { eventId: string; presence?: boolean; rating?: boolean }
) {
  const { eventId } = undo
  if (undo.presence && !(await readAttendanceQuestions(userId, eventId)).length)
    throw noQuestion()
  await db.transaction(async (tx) => {
    if (undo.presence) {
      await tx
        .delete(attendanceReport)
        .where(
          and(
            eq(attendanceReport.userId, userId),
            eq(attendanceReport.eventId, eventId)
          )
        )
    }
    if (undo.rating) {
      await tx
        .delete(barRating)
        .where(
          and(eq(barRating.actorUserId, userId), eq(barRating.eventId, eventId))
        )
    }
  })
}

const noQuestion = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'Não há pergunta aberta para este jogo.'
  })
