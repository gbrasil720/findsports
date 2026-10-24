import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { VALIDATION_WINDOW_MARGIN_INTERVAL } from '@findsports_oficial/db/event-window'
import {
  eventEndSql,
  eventNotEndedSql,
  utcNowSql
} from '@findsports_oficial/db/event-window-sql'
import { event } from '@findsports_oficial/db/schema/platform'
import { reservation } from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'

/**
 * O que o bar Elite tem por causa do código do balcão: a lista de quem vai e
 * a validação (decisão do dono em 16/10/2026, que tirou a reserva de mesa).
 * Quem perdeu o Elite com código em aberto continua podendo ver e validar,
 * para honrar a oferta que o torcedor já tem na mão (WEB-341).
 *
 * ponytail: os nomes ainda falam em "reservas" porque o código mora nas
 * tabelas da antiga reserva (`attendance-ticket.ts`).
 */

function canEnableReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  return getCurrentPlan(subscription, now) === 'elite'
}

export function assertCanEnableReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canEnableReservations(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A lista de quem vai é um recurso do plano Elite.'
    })
  }
}

/** Jogo que ainda não acabou, pelo fim derivado da ADR 0003. */
export const notEnded = eventNotEndedSql()

/**
 * Janela de validação ainda aberta: o fim derivado mais a margem de
 * `getValidationWindow`, inclusivo como `assertWindowOpen`.
 */
export const validationOpen = sql<boolean>`${eventEndSql()} + ${VALIDATION_WINDOW_MARGIN_INTERVAL}::interval >= ${utcNowSql()}`

/**
 * Gerir o que já existe (WEB-341): ver a fila, responder e validar código.
 * Passa o Elite vigente e também o bar que perdeu o plano com reserva pendente
 * ou confirmada de jogo que ainda não acabou: o torcedor segue com o código na
 * mão, e o bar precisa conseguir honrar. Não libera pedido novo, interruptor
 * nem teto, que continuam em `assertCanEnableReservations`.
 */
export async function canManageReservations(
  barId: string,
  subscription: SubscriptionForPlan | null,
  now = new Date()
): Promise<boolean> {
  return (
    canEnableReservations(subscription, now) ||
    (await hasOpenReservations(barId))
  )
}

/**
 * Validar código: como `canManageReservations`, mas "em aberto" vai até o fim
 * da janela de validação. O bar que perdeu o Elite registra quem ficou para o
 * pós-jogo, e a fila continua fechando no fim do jogo.
 */
export async function canValidateReservations(
  barId: string,
  subscription: SubscriptionForPlan | null,
  now = new Date()
): Promise<boolean> {
  return (
    canEnableReservations(subscription, now) ||
    (await hasOpenReservations(barId, validationOpen))
  )
}

export async function hasOpenReservations(
  barId: string,
  stillOpen = notEnded
): Promise<boolean> {
  const [open] = await db
    .select({ id: reservation.id })
    .from(reservation)
    .innerJoin(event, eq(event.id, reservation.eventId))
    .where(
      and(
        eq(event.barId, barId),
        inArray(reservation.status, ['pending', 'confirmed']),
        stillOpen
      )
    )
    .limit(1)
  return open !== undefined
}
