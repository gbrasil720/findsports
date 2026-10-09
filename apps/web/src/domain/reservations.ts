import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { formatEventTime } from '@/domain/pub-profile'
import { errorCode } from '@/domain/reservation-validation'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * Textos do pedido de reserva do torcedor (WEB-124). Como na validação
 * (WEB-118), o texto do servidor não vai para a tela: a recusa chega como
 * código e a mensagem sai daqui.
 */

export type FanReservation =
  inferRouterOutputs<AppRouter>['reservations']['mine'][number]

type ReservationStatus = FanReservation['status']

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  declined: 'Recusada',
  cancelled: 'Cancelada',
  expired: 'Sem resposta',
  // Neutro de propósito: a ADR 0003 registra o comparecimento e não julga.
  ended: 'Jogo encerrado'
}

export const RESERVATION_STATUS_DETAIL: Record<ReservationStatus, string> = {
  pending: 'Aguardando o bar. O pedido só vira reserva quando o bar aceitar.',
  confirmed: 'O bar aceitou. Mostre o código ao chegar.',
  declined: 'O bar não aceitou este pedido.',
  cancelled: 'Você cancelou este pedido.',
  expired: 'O bar não respondeu até o fim do jogo. O pedido não vale mais.',
  ended: 'O jogo já acabou. O código ainda vale no bar até o prazo abaixo.'
}

/** "Chegada registrada (1 de 2) às 16:40", com a chegada mais recente. */
export function formatArrival({
  count,
  of,
  lastAt
}: NonNullable<FanReservation['arrival']>): string {
  const at = lastAt ? ` às ${formatEventTime(new Date(lastAt))}` : ''
  return `Chegada registrada (${count} de ${of})${at}`
}

/**
 * Texto do estado. Chegada registrada pelo bar vem antes de tudo (WEB-259).
 * `ended` varia (WEB-322): o servidor tira o código quando a janela de
 * validação fecha, e o texto acompanha.
 */
export function getStatusDetail({
  status,
  code,
  arrival
}: Pick<FanReservation, 'status' | 'code' | 'arrival'>): string {
  if (arrival) {
    const rest =
      arrival.count < arrival.of && code
        ? ' O mesmo código vale para quem ainda vai chegar.'
        : ''
    return `${formatArrival(arrival)}.${rest}`
  }
  if (status === 'ended' && !code) {
    return 'O jogo já acabou e o código desta reserva não vale mais.'
  }
  return RESERVATION_STATUS_DETAIL[status]
}

export const PENDING_NOTICE =
  'Isto é um pedido: ele só vira reserva quando o bar aceitar.'

export const SOLD_OUT_MESSAGE = 'Reservas esgotadas para este jogo.'

export const DUPLICATE_REQUEST_MESSAGE =
  'Você já tem um pedido ativo para este jogo. Acompanhe em Minhas reservas.'

/**
 * O pedido do torcedor que ainda ocupa o jogo: pendente ou confirmado, os
 * mesmos estados do índice de pedido ativo no servidor. Serve para a tela
 * avisar antes do envio (WEB-295); quem recusa o segundo pedido é o servidor.
 */
export function findActiveRequest(
  reservations: FanReservation[] | undefined,
  eventId: string
): FanReservation | undefined {
  return reservations?.find(
    (item) =>
      item.event.id === eventId &&
      (item.status === 'pending' || item.status === 'confirmed')
  )
}

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
    case 'UNPROCESSABLE_CONTENT':
      return SOLD_OUT_MESSAGE
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
    // Chegada registrada trava o cancelamento (WEB-259).
    case 'CONFLICT':
      return 'O bar já registrou chegada nesta reserva. Ela não pode mais ser cancelada.'
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

/* "Vou assistir aqui" depois que a reserva acaba (WEB-296) */

export const PRESENCE_KEPT_MESSAGE =
  'Você continua marcado em “Vou assistir aqui” neste jogo.'

export const PRESENCE_REMOVED_MESSAGE =
  'Você não está mais marcado em “Vou assistir aqui” neste jogo.'

/**
 * O que a reserva encerrada diz sobre a presença. Cancelar mantém; a recusa
 * do bar desfaz só a que a reserva criou (ADR 0003). `kept` vem com a ação de
 * desmarcar. Depois do início do jogo a presença não muda mais, então não há
 * o que dizer.
 */
export function getPresenceNote(
  {
    status,
    attending,
    event
  }: Pick<FanReservation, 'status' | 'attending'> & {
    event: Pick<FanReservation['event'], 'startsAt'>
  },
  now = Date.now()
): 'kept' | 'removed' | null {
  if (status !== 'cancelled' && status !== 'declined') return null
  if (new Date(event.startsAt).getTime() <= now) return null
  if (attending) return 'kept'
  return status === 'declined' ? 'removed' : null
}

/* Aviso de resposta do bar (WEB-318) */

const decidedAtMs = ({ decidedAt }: Pick<FanReservation, 'decidedAt'>) =>
  decidedAt ? new Date(decidedAt).getTime() : 0

/**
 * Respostas do bar mais novas que a última que este navegador já mostrou,
 * da mais recente para a mais antiga. O servidor só manda `decidedAt` em
 * reserva confirmada ou recusada de jogo que ainda não acabou.
 */
export function getUnseenDecisions<T extends Pick<FanReservation, 'decidedAt'>>(
  reservations: T[] | undefined,
  seenUntil: number
): T[] {
  return (reservations ?? [])
    .filter((item) => decidedAtMs(item) > seenUntil)
    .sort((a, b) => decidedAtMs(b) - decidedAtMs(a))
}

/** A resposta mais recente da lista, em ms; `0` sem nenhuma. */
export function getLatestDecision(
  reservations: Pick<FanReservation, 'decidedAt'>[]
): number {
  return Math.max(0, ...reservations.map(decidedAtMs))
}

/**
 * Texto do toast. Na recusa é aqui que o torcedor fica sabendo o que houve
 * com "Vou assistir aqui" (WEB-296), então o aviso sempre diz.
 */
export function getDecisionNotice({
  status,
  attending,
  bar
}: Pick<FanReservation, 'status' | 'attending'> & {
  bar: Pick<FanReservation['bar'], 'name'>
}): { title: string; description: string } {
  return status === 'declined'
    ? {
        title: `${bar.name} recusou seu pedido de reserva.`,
        description: attending
          ? PRESENCE_KEPT_MESSAGE
          : PRESENCE_REMOVED_MESSAGE
      }
    : {
        title: `${bar.name} confirmou sua reserva.`,
        description: 'O código para mostrar no bar está em Minhas reservas.'
      }
}

/* Fila do bar (WEB-125) */

export type BarReservation =
  inferRouterOutputs<AppRouter>['barReservations']['list'][number]

export type ReservationAnswer = 'confirmed' | 'declined'

export const ANSWER_RESULT: Record<ReservationAnswer, string> = {
  confirmed: 'Reserva confirmada. O torcedor já vê a confirmação.',
  declined: 'Pedido recusado. O torcedor já vê a recusa.'
}

export function getRespondErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'PRECONDITION_FAILED':
      return 'Este pedido não pode mais ser respondido: o torcedor cancelou ou o jogo acabou.'
    case 'CONFLICT':
      return 'Este pedido já tinha sido respondido. A lista foi atualizada.'
    case 'NOT_FOUND':
      return 'Pedido não encontrado.'
    case 'FORBIDDEN':
      return 'Responder pedidos de reserva é um recurso do plano Elite.'
    default:
      return getUserFacingMessage(
        error,
        'Não foi possível responder o pedido. Tente novamente.'
      )
  }
}
