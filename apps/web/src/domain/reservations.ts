import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { errorCode } from '@/domain/reservation-validation'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * Textos do pedido de reserva do torcedor (WEB-124). Como na validação
 * (WEB-118), o texto do servidor não vai para a tela: a recusa chega como
 * código e a mensagem sai daqui.
 */

export type FanReservation =
  inferRouterOutputs<AppRouter>['reservations']['mine'][number]

export type ReservationStatus = FanReservation['status']

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  declined: 'Recusada',
  cancelled: 'Cancelada'
}

export const RESERVATION_STATUS_DETAIL: Record<ReservationStatus, string> = {
  pending: 'Aguardando o bar. O pedido só vira reserva quando o bar aceitar.',
  confirmed: 'O bar aceitou. Mostre o código ao chegar.',
  declined: 'O bar não aceitou este pedido.',
  cancelled: 'Você cancelou este pedido.'
}

export const PENDING_NOTICE =
  'Isto é um pedido: ele só vira reserva quando o bar aceitar.'

export const DUPLICATE_REQUEST_MESSAGE =
  'Você já tem um pedido ativo para este jogo. Acompanhe em Minhas reservas.'

/**
 * `PRECONDITION_FAILED` cobre dois motivos no servidor; o horário do jogo,
 * que a tela já tem, diz qual.
 */
export function getCreateErrorMessage(
  error: unknown,
  eventStartsAt: Date,
  now = Date.now()
): string {
  switch (errorCode(error)) {
    case 'CONFLICT':
      return DUPLICATE_REQUEST_MESSAGE
    case 'PRECONDITION_FAILED':
      return eventStartsAt.getTime() <= now
        ? 'Este jogo já começou. Escolha um jogo que ainda vai acontecer.'
        : 'Este bar não está recebendo reservas pela Onside no momento.'
    case 'NOT_FOUND':
      return 'Este jogo não está mais disponível.'
    case 'BAD_REQUEST':
      return 'Confira a quantidade de pessoas e a observação.'
    default:
      return getUserFacingMessage(
        error,
        'Não foi possível enviar o pedido. Tente novamente.'
      )
  }
}

export function getCancelErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'PRECONDITION_FAILED':
      return 'Este pedido não pode mais ser cancelado.'
    case 'NOT_FOUND':
      return 'Reserva não encontrada.'
    default:
      return getUserFacingMessage(
        error,
        'Não foi possível cancelar o pedido. Tente novamente.'
      )
  }
}
