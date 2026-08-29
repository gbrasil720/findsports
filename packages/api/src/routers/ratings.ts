import { and, db, eq, sql } from '@findsports_oficial/db'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import { EVENT_LIVE_WINDOW_MS } from '../lib/event-profile-window'
import { RATING_WINDOW_DAYS } from '../lib/rating'

/**
 * Tipos de evento comercial que contam como intenção de ir.
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
 * O torcedor pode avaliar este bar por este jogo?
 *
 * Três condições, todas verificadas no servidor porque todas são a diferença
 * entre uma nota que significa alguma coisa e um placar de popularidade:
 *
 *   1. ele demonstrou intenção de ir — abriu rota, WhatsApp ou telefone
 *      DAQUELE bar, para AQUELE jogo. É o sinal mais próximo de presença que
 *      existe sem check-in, e `bar_commercial_event` já o registra com
 *      `actor_user_id` e `source_event_id`;
 *   2. o jogo já acabou. Avaliar antes seria avaliar expectativa;
 *   3. faz menos de `RATING_WINDOW_DAYS` que acabou. Depois disso é memória,
 *      não observação — e é onde mora a avaliação movida por raiva acumulada.
 *
 * Devolve o motivo da recusa em vez de um booleano: quem chama precisa saber
 * a diferença entre "ainda não pode" e "não pode mais".
 */
async function checkEligibility(input: {
  userId: string
  barId: string
  eventId: string
  now: Date
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = await db.execute(sql`
    SELECT
      e.starts_at,
      e.ends_at,
      EXISTS (
        SELECT 1 FROM bar_commercial_event ce
        WHERE ce.bar_id = ${input.barId}
          AND ce.actor_user_id = ${input.userId}
          AND ce.source_event_id = ${input.eventId}
          AND ce.type IN (${sql.join(
            INTENT_TYPES.map((type) => sql`${type}`),
            sql`, `
          )})
      ) AS has_intent
    FROM event e
    WHERE e.id = ${input.eventId} AND e.bar_id = ${input.barId}
  `)

  const row = rows.rows[0] as
    | { starts_at: string; ends_at: string | null; has_intent: boolean }
    | undefined

  if (!row) {
    return { ok: false, reason: 'Jogo não encontrado neste bar.' }
  }

  if (!row.has_intent) {
    return {
      ok: false,
      reason: 'Só quem demonstrou interesse em ir a este jogo pode avaliar.'
    }
  }

  const startsAt = new Date(row.starts_at)
  const endsAt = row.ends_at
    ? new Date(row.ends_at)
    : new Date(startsAt.getTime() + EVENT_LIVE_WINDOW_MS)

  if (endsAt.getTime() > input.now.getTime()) {
    return { ok: false, reason: 'O jogo ainda não acabou.' }
  }

  if (input.now.getTime() - endsAt.getTime() > RATING_WINDOW_MS) {
    return {
      ok: false,
      reason: `A avaliação fecha ${RATING_WINDOW_DAYS} dias depois do jogo.`
    }
  }

  return { ok: true }
}

export const ratingsRouter = router({
  /**
   * O que este torcedor pode avaliar e ainda não avaliou.
   *
   * É o que alimenta o card do dashboard. Sem uma superfície que pergunte na
   * hora certa, o sistema inteiro colhe silêncio: ninguém volta ao perfil de
   * um bar no dia seguinte para avaliar por conta própria.
   *
   * A janela e o portão de intenção são os mesmos de `submit` — mas escritos
   * uma vez só, em SQL, porque aqui a pergunta é "quais", não "este pode".
   */
  getPending: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'fan') return []

    const rows = await db.execute(sql`
      SELECT DISTINCT ON (e.id)
        e.id AS event_id,
        e.championship,
        e.starts_at,
        b.id AS bar_id,
        b.name AS bar_name,
        b.neighborhood,
        s.name AS sport_name,
        s.slug AS sport_slug
      FROM bar_commercial_event ce
      JOIN event e ON e.id = ce.source_event_id
      JOIN bar b ON b.id = ce.bar_id
      JOIN sport s ON s.id = e.sport_id
      WHERE ce.actor_user_id = ${ctx.session.user.id}
        AND ce.type IN (${sql.join(
          INTENT_TYPES.map((type) => sql`${type}`),
          sql`, `
        )})
        AND b.is_active
        -- Jogo acabado: fim informado, ou início mais a janela ao vivo.
        AND COALESCE(
          e.ends_at,
          e.starts_at + ${`${EVENT_LIVE_WINDOW_MS} milliseconds`}::interval
        ) <= NOW()
        AND COALESCE(
          e.ends_at,
          e.starts_at + ${`${EVENT_LIVE_WINDOW_MS} milliseconds`}::interval
        ) > NOW() - ${`${RATING_WINDOW_DAYS} days`}::interval
        AND NOT EXISTS (
          SELECT 1 FROM bar_rating r
          WHERE r.bar_id = ce.bar_id
            AND r.actor_user_id = ce.actor_user_id
            AND r.event_id = ce.source_event_id
        )
      ORDER BY e.id, e.starts_at DESC
      LIMIT 5
    `)

    return (
      rows.rows as {
        event_id: string
        championship: string
        starts_at: string
        bar_id: string
        bar_name: string
        neighborhood: string
        sport_name: string
        sport_slug: string
      }[]
    ).map((row) => ({
      eventId: row.event_id,
      championship: row.championship,
      startsAt: row.starts_at,
      barId: row.bar_id,
      barName: row.bar_name,
      neighborhood: row.neighborhood,
      sport: { name: row.sport_name, slug: row.sport_slug }
    }))
  }),

  /**
   * Registra — ou corrige — a avaliação de um jogo.
   *
   * Reenviar troca a resposta em vez de somar outra: a chave única é
   * `(bar, torcedor, jogo)`, e a trigger de contadores trata `UPDATE`
   * mexendo só no numerador. Quem mudou de ideia não infla a amostra.
   */
  submit: protectedProcedure
    .input(
      z.object({
        barId: z.string().uuid(),
        eventId: z.string().uuid(),
        wouldReturn: z.boolean()
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'fan') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas torcedores podem avaliar bares.'
        })
      }

      const eligibility = await checkEligibility({
        userId: ctx.session.user.id,
        barId: input.barId,
        eventId: input.eventId,
        now: new Date()
      })

      if (!eligibility.ok) {
        throw new TRPCError({ code: 'FORBIDDEN', message: eligibility.reason })
      }

      await db
        .insert(barRating)
        .values({
          barId: input.barId,
          actorUserId: ctx.session.user.id,
          eventId: input.eventId,
          wouldReturn: input.wouldReturn
        })
        .onConflictDoUpdate({
          target: [barRating.barId, barRating.actorUserId, barRating.eventId],
          set: { wouldReturn: input.wouldReturn, updatedAt: new Date() }
        })

      return { success: true }
    }),

  /** Desfaz a própria avaliação. */
  remove: protectedProcedure
    .input(z.object({ barId: z.string().uuid(), eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(barRating)
        .where(
          and(
            eq(barRating.barId, input.barId),
            eq(barRating.actorUserId, ctx.session.user.id),
            eq(barRating.eventId, input.eventId)
          )
        )

      return { success: true }
    })
})
