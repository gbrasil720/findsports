import { and, db, eq, inArray, isNull } from '@findsports_oficial/db'
import {
  getEventEnd,
  getValidationWindow
} from '@findsports_oficial/db/event-window'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import {
  normalizeReservationNote,
  RESERVATION_NOTE_MAX_LENGTH,
  RESERVATION_PARTY_SIZE_MAX,
  reservationNoteLength
} from '@findsports_oficial/db/reservation-limits'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, router } from '../index'
import { byMatchOrder } from '../lib/game-participants'
import {
  assertReceivesReservations,
  withSeatAvailability
} from '../lib/reservation-intake'
import {
  deriveFanReservation,
  type FanReservationStatus,
  pgField
} from '../lib/reservation-validation'

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

function isActive(status: FanReservationStatus) {
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
      eventId: true,
      status: true,
      partySize: true,
      note: true,
      offerSnapshot: true,
      createdAt: true,
      updatedAt: true
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
          participants: {
            with: { team: { columns: { name: true } } },
            orderBy: byMatchOrder
          }
        }
      },
      codes: {
        where: isNull(reservationCode.retiredAt),
        columns: { code: true, usedCount: true, maxUses: true },
        with: {
          uses: {
            where: isNull(reservationCodeUse.undoneAt),
            columns: { usedAt: true }
          }
        }
      }
    },
    orderBy: (row, { desc }) => [desc(row.createdAt)],
    limit: HISTORY_LIMIT
  })
  // "Vou assistir aqui" dos mesmos jogos: a tela diz se a presença ficou
  // depois de um cancelamento ou saiu com a recusa (WEB-296).
  const attended = new Set(
    rows.length
      ? (
          await db
            .select({ eventId: attendance.eventId })
            .from(attendance)
            .where(
              and(
                eq(attendance.userId, userId),
                inArray(
                  attendance.eventId,
                  rows.map((row) => row.eventId)
                )
              )
            )
        ).map((row) => row.eventId)
      : []
  )

  return rows.map(({ event: game, codes, updatedAt, eventId, ...row }) => {
    const active = codes[0]
    const usedCount = active?.usedCount ?? 0
    const { status, showCode } = deriveFanReservation(
      row.status,
      game,
      usedCount > 0,
      now
    )
    const code = showCode ? (active?.code ?? null) : null
    const answered = row.status === 'confirmed' || row.status === 'declined'
    return {
      ...row,
      status,
      // Chegadas que o bar registrou no código (WEB-259). `lastAt` é a mais
      // recente ainda valendo; desfeita não conta.
      arrival:
        active && usedCount > 0
          ? {
              count: usedCount,
              of: active.maxUses,
              lastAt: active.uses.reduce<Date | null>(
                (last, { usedAt }) => (!last || usedAt > last ? usedAt : last),
                null
              )
            }
          : null,
      attending: attended.has(eventId),
      // Quando o bar respondeu, enquanto isso ainda é notícia: o aviso do
      // torcedor (WEB-318) compara com o que ele já viu. Depois do jogo não
      // há o que avisar.
      // ponytail: lê `updated_at` em vez de coluna própria. Vale porque
      // nenhuma outra escrita toca uma reserva que segue confirmada ou
      // recusada; se passar a existir (editar pessoas, por exemplo), criar
      // `responded_at`.
      decidedAt: answered && getEventEnd(game) > now ? updatedAt : null,
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
      canCancel: isActive(status) && game.startsAt > now && usedCount === 0
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
        columns: { startsAt: true, reservationCap: true },
        with: {
          bar: {
            columns: {
              isActive: true,
              acceptsReservations: true,
              houseOffer: true,
              reservationCap: true
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
      // Contado fora da transação de propósito: duas criações simultâneas não
      // confirmam nada, então a corrida só deixa passar pedidos `pending` a
      // mais, e confirmar é sempre do dono.
      const [availability] = await withSeatAvailability(
        [{ id: input.eventId, reservationCap: game.reservationCap }],
        game.bar.reservationCap
      )
      if (availability?.soldOut) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: 'Reservas esgotadas para este jogo.'
        })
      }

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
          // Reserva implica presença (ADR 0003). Cancelar não desfaz; a
          // recusa do bar desfaz só a que nasceu aqui. Presença que já
          // existia fica com a origem que tinha.
          await tx
            .insert(attendance)
            .values({ userId, eventId: input.eventId, source: 'reservation' })
            .onConflictDoNothing()
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
   *
   * Chegada registrada trava o cancelamento (ADR 0003, WEB-259): sem isso o
   * código aposentava com gente já validada nele.
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

        // Trava a linha do código antes de ler o contador. O `+1` de
        // `registerArrival` atualiza essa mesma linha pela trigger: se ele
        // chegou antes, esta leitura espera e já vê a chegada; se chega
        // depois, espera o cancelamento e encontra o código aposentado. É
        // `NO KEY UPDATE`, a trava do próprio `UPDATE` abaixo, para não
        // disputar com a chave estrangeira do uso que está sendo inserido.
        const [activeCode] = await tx
          .select({ usedCount: reservationCode.usedCount })
          .from(reservationCode)
          .where(
            and(
              eq(reservationCode.reservationId, input.reservationId),
              isNull(reservationCode.retiredAt)
            )
          )
          .limit(1)
          .for('no key update')
        if ((activeCode?.usedCount ?? 0) > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'O bar já registrou chegada nesta reserva. Ela não pode mais ser cancelada.'
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
