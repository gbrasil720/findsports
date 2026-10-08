import {
  and,
  db,
  eq,
  inArray,
  isNull,
  type SQL,
  sql
} from '@findsports_oficial/db'
import { DEFAULT_EVENT_DURATION_INTERVAL } from '@findsports_oficial/db/event-window'
import { RESERVATION_CAP_MAX } from '@findsports_oficial/db/reservation-limits'
import { bar, event } from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { pubProcedure, router } from '../index'
import {
  assertCanEnableReservations,
  withSeatAvailability
} from '../lib/reservation-intake'

/**
 * Fila de pedidos de reserva do bar (WEB-125): listar, confirmar, recusar.
 *
 * Nenhuma entrada carrega `barId`: o bar sai da sessão, e toda leitura e
 * escrita filtra pelos jogos dele. Pedido de outro bar responde como
 * inexistente.
 *
 * Exige Elite vigente, mas não o interruptor de recebimento (WEB-131):
 * desligar impede pedidos novos, e os que já chegaram ainda precisam de
 * resposta.
 */

const ownerProcedure = pubProcedure.use(async ({ ctx, next }) => {
  const ownBar = await db.query.bar.findFirst({
    where: eq(bar.userId, ctx.session.user.id),
    columns: { id: true },
    with: { subscription: true }
  })
  if (!ownBar) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado para este usuário.'
    })
  }
  assertCanEnableReservations(ownBar.subscription ?? null)
  return next({ ctx: { ...ctx, barId: ownBar.id } })
})

/** Teto em pessoas; `null` tira o teto (ou, no jogo, volta ao padrão do bar). */
const reservationCapInput = z
  .number()
  .int()
  .min(1)
  .max(RESERVATION_CAP_MAX)
  .nullable()

const ownEvents = (barId: string, extra?: SQL) =>
  db
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.barId, barId), extra))

/** Jogo que ainda não acabou, pelo fim derivado da ADR 0003. */
const notEnded = sql`coalesce(${event.endsAt}, ${event.startsAt} + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval) > now()`

/**
 * O `UPDATE` condicional não alterou nada: passa só se o pedido já está na
 * resposta pedida (repetição). Outro estado é recusa, e pedido de outro bar
 * é inexistente.
 */
async function assertAlreadyAnswered(
  own: SQL | undefined,
  answer: 'confirmed' | 'declined'
) {
  const [current] = await db
    .select({ status: reservation.status })
    .from(reservation)
    .where(own)
    .limit(1)
  if (!current) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Pedido não encontrado.'
    })
  }
  if (current.status === answer) return
  if (current.status === 'cancelled') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'O torcedor cancelou este pedido.'
    })
  }
  // Ainda pendente e o `UPDATE` não pegou: o jogo acabou e o pedido expirou.
  if (current.status === 'pending') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'O jogo já acabou. Este pedido expirou sem resposta.'
    })
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message:
      current.status === 'declined'
        ? 'Este pedido já foi recusado.'
        : 'Este pedido já foi confirmado.'
  })
}

export const barReservationsRouter = router({
  /**
   * Pedidos dos jogos que ainda não acabaram, pendentes primeiro e, dentro de
   * cada estado, por ordem de chegada. Do torcedor, só o nome: telefone e
   * e-mail não saem daqui.
   */
  list: ownerProcedure.query(async ({ ctx }) => {
    // ponytail: sem paginação; o teto por jogo (WEB-152) limita o volume.
    const rows = await db.query.reservation.findMany({
      where: inArray(reservation.eventId, ownEvents(ctx.barId, notEnded)),
      columns: {
        id: true,
        status: true,
        partySize: true,
        note: true,
        // A cópia congelada na reserva, nunca `bar.house_offer` (ADR 0003).
        offerSnapshot: true,
        createdAt: true
      },
      with: {
        user: { columns: { name: true } },
        event: {
          columns: {
            championship: true,
            participantFreeText: true,
            startsAt: true
          },
          with: {
            participants: { with: { team: { columns: { name: true } } } }
          }
        }
      },
      orderBy: (row, { asc }) => [
        sql`${row.status} <> 'pending'`,
        asc(row.createdAt)
      ]
    })

    return rows.map(({ user: guest, event: game, ...row }) => ({
      ...row,
      guestName: guest.name,
      event: {
        championship: game.championship,
        participantFreeText: game.participantFreeText,
        participants: game.participants.map(({ team }) => team.name),
        startsAt: game.startsAt
      }
    }))
  }),

  /**
   * Lotação dos jogos que ainda não acabaram (WEB-152): pessoas confirmadas
   * diante do teto efetivo. O teto só fecha pedidos novos; confirmar além
   * dele continua permitido, e é por isso que o dono vê o número.
   */
  capacity: ownerProcedure.query(async ({ ctx }) => {
    const ownBar = await db.query.bar.findFirst({
      where: eq(bar.id, ctx.barId),
      columns: { reservationCap: true },
      with: {
        events: {
          where: notEnded,
          columns: {
            id: true,
            championship: true,
            participantFreeText: true,
            startsAt: true,
            reservationCap: true
          },
          with: {
            participants: { with: { team: { columns: { name: true } } } }
          },
          orderBy: (row, { asc }) => [asc(row.startsAt)]
        }
      }
    })
    const defaultCap = ownBar?.reservationCap ?? null
    const games = await withSeatAvailability(ownBar?.events ?? [], defaultCap)

    return {
      defaultCap,
      games: games.map(({ participants, ...game }) => ({
        ...game,
        participants: participants.map(({ team }) => team.name)
      }))
    }
  }),

  setDefaultCap: ownerProcedure
    .input(z.object({ reservationCap: reservationCapInput }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(bar)
        .set({ reservationCap: input.reservationCap })
        .where(eq(bar.id, ctx.barId))
      return { reservationCap: input.reservationCap }
    }),

  setGameCap: ownerProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        reservationCap: reservationCapInput
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(event)
        .set({ reservationCap: input.reservationCap })
        .where(and(eq(event.id, input.eventId), eq(event.barId, ctx.barId)))
        .returning({ id: event.id })
      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Jogo não encontrado.'
        })
      }
      return { reservationCap: input.reservationCap }
    }),

  /**
   * Só pedido pendente muda. A condição de estado vai no próprio `UPDATE`:
   * duas respostas simultâneas disputam a linha no banco, e só a primeira
   * encontra `pending`. Depois do fim do jogo o pedido expirou (a fila já
   * não o mostra) e não muda mais. Repetir a MESMA resposta devolve o estado
   * atual com `changed: false`; responder diferente, ou responder pedido
   * cancelado ou expirado, falha.
   */
  respond: ownerProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        status: z.enum(['confirmed', 'declined'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const own = (extra?: SQL) =>
        and(
          eq(reservation.id, input.reservationId),
          inArray(reservation.eventId, ownEvents(ctx.barId, extra))
        )

      const changed = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(reservation)
          .set({ status: input.status })
          .where(and(own(notEnded), eq(reservation.status, 'pending')))
          .returning({ id: reservation.id })
        if (!updated) return false

        if (input.status === 'declined') {
          // Recusado, o código para de valer no bar e volta a circular.
          await tx
            .update(reservationCode)
            .set({ retiredAt: new Date() })
            .where(
              and(
                eq(reservationCode.reservationId, input.reservationId),
                isNull(reservationCode.retiredAt)
              )
            )
        }
        return true
      })
      if (!changed) await assertAlreadyAnswered(own(), input.status)
      return { status: input.status, changed }
    })
})
