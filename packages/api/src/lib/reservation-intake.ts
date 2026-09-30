import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { reservation } from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'

/**
 * Recebimento de reservas (WEB-131). Três níveis decidem se o torcedor pode
 * pedir mesa num bar:
 *
 * - capacidade — o bar **pode**: Elite vigente, pela assinatura;
 * - disposição — o bar **quer**: `bar.accepts_reservations`, desligado por
 *   padrão;
 * - disponibilidade — ainda **cabe** neste jogo: teto de pessoas confirmadas
 *   (WEB-152, ADR 0003 "Teto por jogo").
 *
 * Só vale para pedido NOVO. Reserva já criada continua legível, cancelável e
 * com código validável dentro da janela: cancelar e validar não passam por
 * aqui.
 */

function canEnableReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  return getCurrentPlan(subscription, now) === 'elite'
}

/**
 * Chamado antes de gravar `true`. Desligar não passa por aqui: um bar que
 * perdeu o Elite com o recebimento ligado precisa conseguir desligar.
 */
export function assertCanEnableReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canEnableReservations(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Receber reservas é um recurso do plano Elite.'
    })
  }
}

/** O bar recebe pedidos agora: quer e pode. */
export function receivesReservations(
  acceptsReservations: boolean,
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  return acceptsReservations && canEnableReservations(subscription, now)
}

/**
 * Esconder o botão não é validação: o procedimento que cria reserva chama
 * isto antes de gravar.
 */
export function assertReceivesReservations(
  acceptsReservations: boolean,
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!receivesReservations(acceptsReservations, subscription, now)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Este bar não está recebendo reservas pela Onside no momento.'
    })
  }
}

/**
 * Disponibilidade de um jogo. O teto efetivo é o do jogo, ou então o padrão
 * do bar; sem nenhum dos dois, não há teto. Confirmadas no teto ou acima dele
 * fecham pedidos novos, e só isso: confirmar além do teto continua permitido.
 */
export function seatAvailability(
  gameCap: number | null,
  barCap: number | null,
  confirmedSeats: number
) {
  const effectiveCap = gameCap ?? barCap
  return {
    confirmedSeats,
    effectiveCap,
    soldOut: effectiveCap !== null && confirmedSeats >= effectiveCap
  }
}

/**
 * Jogos de um mesmo bar com a disponibilidade de cada um. Só `confirmed`
 * ocupa lugar: uma rajada de pedidos sem resposta não pode trancar os pedidos
 * reais (ADR 0003). A soma usa `reservation_eventId_status_createdAt_idx`.
 */
export async function withSeatAvailability<
  T extends { id: string; reservationCap: number | null }
>(games: T[], barCap: number | null) {
  const rows = games.length
    ? await db
        .select({
          eventId: reservation.eventId,
          seats: sql<number>`sum(${reservation.partySize})::int`
        })
        .from(reservation)
        .where(
          and(
            inArray(
              reservation.eventId,
              games.map(({ id }) => id)
            ),
            eq(reservation.status, 'confirmed')
          )
        )
        .groupBy(reservation.eventId)
    : []
  const seats = new Map(rows.map((row) => [row.eventId, row.seats]))
  return games.map((game) => ({
    ...game,
    ...seatAvailability(game.reservationCap, barCap, seats.get(game.id) ?? 0)
  }))
}
