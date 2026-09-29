import { TRPCError } from '@trpc/server'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'

/**
 * Recebimento de reservas (WEB-131). Três níveis decidem se o torcedor pode
 * pedir mesa num bar:
 *
 * - capacidade — o bar **pode**: Elite vigente, pela assinatura;
 * - disposição — o bar **quer**: `bar.accepts_reservations`, desligado por
 *   padrão;
 * - disponibilidade — ainda **cabe** neste jogo: WEB-132, fora daqui.
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
