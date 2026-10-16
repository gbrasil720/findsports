import { and, db, eq, inArray, isNull, sql } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event } from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'

import { pubProcedure, router } from '../index'
import { participantNames } from '../lib/game-participants'
import {
  assertCanEnableReservations,
  canManageReservations,
  hasOpenReservations,
  validationOpen
} from '../lib/reservation-intake'

/**
 * "Quem vai" do bar (seção 17 do design): por jogo, quem marcou "Vou assistir
 * aqui" e quem já validou o código no balcão. Substituiu a fila de pedidos
 * de reserva quando a reserva de mesa saiu do produto (16/10/2026). Quem
 * marca já recebe o código: o bar não aprova ninguém.
 *
 * Nenhuma entrada carrega `barId`: o bar sai da sessão. Do torcedor, só o
 * nome; telefone e e-mail não saem daqui. É recurso do Elite, e continua
 * para quem perdeu o plano com código em aberto, que precisa honrar a oferta
 * (WEB-341).
 */

const barProcedure = pubProcedure.use(async ({ ctx, next }) => {
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
  return next({
    ctx: { ...ctx, barId: ownBar.id, subscription: ownBar.subscription ?? null }
  })
})

/** Elite vigente, ou código em aberto para honrar. */
const ownerProcedure = barProcedure.use(async ({ ctx, next }) => {
  if (!(await canManageReservations(ctx.barId, ctx.subscription))) {
    assertCanEnableReservations(ctx.subscription)
  }
  return next()
})

export const barReservationsRouter = router({
  /**
   * Há reserva pendente ou confirmada de jogo que ainda não acabou. É o que
   * mantém a aba Quem vai e a validação no painel de quem não recebe mais
   * pedido novo (WEB-341). Sem guarda de plano: só diz o que desenhar.
   */
  hasOpen: barProcedure.query(({ ctx }) => hasOpenReservations(ctx.barId)),

  /**
   * O mesmo, até a janela de validação fechar: é o que `/admin/validate`
   * desenha para quem não tem Elite. Quem decide é `reservationValidation`.
   */
  hasValidatable: barProcedure.query(({ ctx }) =>
    hasOpenReservations(ctx.barId, validationOpen)
  ),

  /**
   * Os jogos com a validação ainda aberta, do mais próximo ao mais distante,
   * cada um com quem vai e quando validou. Quem validou primeiro, e dentro de
   * cada grupo, quem marcou antes.
   */
  going: ownerProcedure.query(async ({ ctx }) => {
    // ponytail: sem paginação; o volume é o de quem marca num bar só.
    const rows = await db
      .select({
        eventId: event.id,
        championship: event.championship,
        participantFreeText: event.participantFreeText,
        participants: participantNames(sql`${event.id}`),
        startsAt: event.startsAt,
        name: user.name,
        markedAt: attendance.createdAt,
        validatedAt: sql<Date | null>`max(${reservationCodeUse.usedAt})`
      })
      .from(attendance)
      .innerJoin(event, eq(event.id, attendance.eventId))
      .innerJoin(user, eq(user.id, attendance.userId))
      .leftJoin(
        reservation,
        and(
          eq(reservation.userId, attendance.userId),
          eq(reservation.eventId, attendance.eventId),
          inArray(reservation.status, ACTIVE_RESERVATION_STATUSES)
        )
      )
      .leftJoin(
        reservationCode,
        and(
          eq(reservationCode.reservationId, reservation.id),
          isNull(reservationCode.retiredAt)
        )
      )
      .leftJoin(
        reservationCodeUse,
        and(
          eq(reservationCodeUse.codeId, reservationCode.id),
          isNull(reservationCodeUse.undoneAt)
        )
      )
      .where(and(eq(event.barId, ctx.barId), validationOpen))
      .groupBy(event.id, user.id, attendance.createdAt)
      .orderBy(event.startsAt, event.id)

    const games = new Map<
      string,
      {
        id: string
        championship: string
        participantFreeText: string | null
        participants: string[]
        startsAt: Date
        people: { name: string; markedAt: Date; validatedAt: Date | null }[]
      }
    >()
    for (const { eventId, name, markedAt, validatedAt, ...game } of rows) {
      const entry = games.get(eventId) ?? { id: eventId, ...game, people: [] }
      entry.people.push({
        name,
        markedAt,
        validatedAt: validatedAt ? new Date(validatedAt) : null
      })
      games.set(eventId, entry)
    }
    return [...games.values()].map((game) => ({
      ...game,
      people: game.people.sort(
        (a, b) =>
          Number(b.validatedAt !== null) - Number(a.validatedAt !== null) ||
          a.markedAt.getTime() - b.markedAt.getTime()
      ),
      validated: game.people.filter(({ validatedAt }) => validatedAt).length
    }))
  })
})
