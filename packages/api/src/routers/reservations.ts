import { and, db, eq, isNull } from '@findsports_oficial/db'
import { getValidationWindow } from '@findsports_oficial/db/event-window'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import {
  normalizeReservationNote,
  RESERVATION_NOTE_MAX_LENGTH,
  RESERVATION_PARTY_SIZE_MAX,
  reservationNoteLength
} from '@findsports_oficial/db/reservation-limits'
import { event } from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  type ReservationStatus,
  reservation,
  reservationCode
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, router } from '../index'
import { assertReceivesReservations } from '../lib/reservation-intake'
import { pgField } from '../lib/reservation-validation'

/**
 * Pedido de reserva do lado do torcedor (WEB-124): pedir, acompanhar,
 * cancelar.
 *
 * Nenhuma entrada carrega `barId`, `userId` nem estado: o bar sai do evento,
 * o dono do pedido sai da sessão, e o estado só muda pelas transições daqui.
 * Toda leitura filtra pelo torcedor da sessão, então reserva alheia responde
 * como inexistente.
 *
 * Só criar passa por `assertReceivesReservations`. Ler e cancelar continuam
 * valendo com o bar sem Elite ou com o recebimento desligado (ADR 0003,
 * "Disposição do bar"): downgrade não pode prender ninguém num pedido.
 */

const UNIQUE_VIOLATION = '23505'

/** Colisão de código é rara (36^6); o laço só evita falhar por azar. */
const CODE_ATTEMPTS = 5

// ponytail: sem paginação; o torcedor vê os 50 pedidos mais recentes.
const HISTORY_LIMIT = 50

function isActive(status: ReservationStatus) {
  return ACTIVE_RESERVATION_STATUSES.some((active) => active === status)
}

async function readOwnReservations(userId: string, reservationId?: string) {
  const now = new Date()
  const rows = await db.query.reservation.findMany({
    where: and(
      eq(reservation.userId, userId),
      reservationId ? eq(reservation.id, reservationId) : undefined
    ),
    columns: {
      id: true,
      status: true,
      partySize: true,
      note: true,
      offerSnapshot: true,
      createdAt: true
    },
    with: {
      event: {
        columns: {
          id: true,
          championship: true,
          participantFreeText: true,
          startsAt: true,
          endsAt: true
        },
        with: {
          bar: { columns: { id: true, name: true, neighborhood: true } },
          participants: { with: { team: { columns: { name: true } } } }
        }
      },
      codes: {
        where: isNull(reservationCode.retiredAt),
        columns: { code: true }
      }
    },
    orderBy: (row, { desc }) => [desc(row.createdAt)],
    limit: HISTORY_LIMIT
  })

  return rows.map(({ event: game, codes, ...row }) => {
    const active = isActive(row.status)
    // Código de pedido recusado ou cancelado não vale no bar: não mostrar.
    const code = active ? (codes[0]?.code ?? null) : null
    return {
      ...row,
      bar: game.bar,
      event: {
        id: game.id,
        championship: game.championship,
        participantFreeText: game.participantFreeText,
        participants: game.participants.map(({ team }) => team.name),
        startsAt: game.startsAt
      },
      code,
      window: code ? getValidationWindow(game) : null,
      canCancel: active && game.startsAt > now
    }
  })
}

async function readOwnReservation(userId: string, reservationId: string) {
  const [found] = await readOwnReservations(userId, reservationId)
  return found
}

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada.' })

export const reservationsRouter = router({
  mine: fanProcedure.query(({ ctx }) =>
    readOwnReservations(ctx.session.user.id)
  ),

  /**
   * `requestId` é gerado pela tela para cada pedido pretendido e vira o `id`
   * da reserva: duplo clique ou reenvio do MESMO pedido devolve a reserva que
   * o primeiro gravou. Um pedido DIFERENTE para o mesmo jogo esbarra no
   * índice de pedido ativo e recebe a mensagem de duplicidade.
   */
  create: fanProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        eventId: z.string().uuid(),
        partySize: z
          .number()
          .int()
          .min(1, 'Informe quantas pessoas vão.')
          .max(
            RESERVATION_PARTY_SIZE_MAX,
            `Pedidos pela Onside aceitam até ${RESERVATION_PARTY_SIZE_MAX} pessoas. Para grupos maiores, fale com o bar.`
          ),
        // Teto frouxo só contra corpo gigante; o limite real é contado depois
        // de normalizar, como o CHECK conta.
        note: z
          .string()
          .max(4 * RESERVATION_NOTE_MAX_LENGTH)
          .nullish()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const replayed = await readOwnReservation(userId, input.requestId)
      if (replayed) {
        if (replayed.event.id !== input.eventId) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Não foi possível enviar este pedido. Tente de novo.'
          })
        }
        return replayed
      }

      const note = normalizeReservationNote(input.note)
      if (reservationNoteLength(note) > RESERVATION_NOTE_MAX_LENGTH) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A observação pode ter até ${RESERVATION_NOTE_MAX_LENGTH} caracteres.`
        })
      }

      const now = new Date()
      const game = await db.query.event.findFirst({
        where: eq(event.id, input.eventId),
        columns: { startsAt: true },
        with: {
          bar: {
            columns: {
              isActive: true,
              acceptsReservations: true,
              houseOffer: true
            },
            with: {
              subscription: {
                columns: { plan: true, status: true, currentPeriodEnd: true }
              }
            }
          }
        }
      })
      if (!game?.bar.isActive) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Jogo não encontrado.'
        })
      }
      if (game.startsAt <= now) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Este jogo já começou. Reservas só podem ser pedidas para jogos que ainda vão acontecer.'
        })
      }
      assertReceivesReservations(
        game.bar.acceptsReservations,
        game.bar.subscription ?? null,
        now
      )

      try {
        await db.transaction(async (tx) => {
          await tx.insert(reservation).values({
            id: input.requestId,
            eventId: input.eventId,
            userId,
            partySize: input.partySize,
            note,
            // Cópia congelada: o bar pode mudar a oferta amanhã, a promessa
            // feita a este torcedor não muda.
            offerSnapshot: game.bar.houseOffer
          })
          for (let attempt = 1; ; attempt++) {
            const [issued] = await tx
              .insert(reservationCode)
              .values({
                code: generateReservationCode(),
                reservationId: input.requestId,
                maxUses: input.partySize
              })
              .onConflictDoNothing()
              .returning({ id: reservationCode.id })
            if (issued) break
            if (attempt === CODE_ATTEMPTS) {
              throw new Error('reservation code space exhausted')
            }
          }
        })
      } catch (error) {
        if (pgField(error, 'code') !== UNIQUE_VIOLATION) throw error
        // O mesmo pedido, enviado em paralelo, ganhou a corrida.
        const raced = await readOwnReservation(userId, input.requestId)
        if (raced) return raced
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'Você já tem um pedido ativo para este jogo. Acompanhe em Minhas reservas.'
        })
      }

      const created = await readOwnReservation(userId, input.requestId)
      if (!created) throw notFound()
      return created
    }),

  /**
   * Não passa pelo recebimento de reservas nem pelo plano do bar. Repetir o
   * cancelamento de um pedido já cancelado devolve o mesmo estado.
   */
  cancel: fanProcedure
    .input(z.object({ reservationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await db.transaction(async (tx) => {
        const [own] = await tx
          .select({ status: reservation.status, startsAt: event.startsAt })
          .from(reservation)
          .innerJoin(event, eq(event.id, reservation.eventId))
          .where(
            and(
              eq(reservation.id, input.reservationId),
              eq(reservation.userId, userId)
            )
          )
          .limit(1)
          .for('update', { of: reservation })

        if (!own) throw notFound()
        if (own.status === 'cancelled') return
        if (own.status === 'declined') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Este pedido foi recusado pelo bar e já não vale.'
          })
        }
        if (own.startsAt <= new Date()) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'O jogo já começou. Não dá mais para cancelar este pedido.'
          })
        }

        await tx
          .update(reservation)
          .set({ status: 'cancelled' })
          .where(eq(reservation.id, input.reservationId))
        // Cancelado, o código volta a circular e para de valer no bar.
        await tx
          .update(reservationCode)
          .set({ retiredAt: new Date() })
          .where(
            and(
              eq(reservationCode.reservationId, input.reservationId),
              isNull(reservationCode.retiredAt)
            )
          )
      })

      const cancelled = await readOwnReservation(userId, input.reservationId)
      if (!cancelled) throw notFound()
      return cancelled
    })
})
