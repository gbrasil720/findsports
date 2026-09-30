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
import { bar, event } from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { pubProcedure, router } from '../index'
import { assertCanEnableReservations } from '../lib/reservation-intake'

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
   * Só pedido pendente muda. A condição de estado vai no próprio `UPDATE`:
   * duas respostas simultâneas disputam a linha no banco, e só a primeira
   * encontra `pending`. Repetir a MESMA resposta devolve o estado atual com
   * `changed: false`; responder diferente, ou responder pedido cancelado,
   * falha.
   */
  respond: ownerProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        status: z.enum(['confirmed', 'declined'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const own = and(
        eq(reservation.id, input.reservationId),
        inArray(reservation.eventId, ownEvents(ctx.barId))
      )

      const changed = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(reservation)
          .set({ status: input.status })
          .where(and(own, eq(reservation.status, 'pending')))
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
      if (!changed) await assertAlreadyAnswered(own, input.status)
      return { status: input.status, changed }
    })
})
