import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { countLabel } from '@/lib/plural'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * Textos e estados da validação de código de reserva (WEB-126).
 *
 * O texto do servidor não vai para a tela (WEB-118): cada recusa chega como
 * código de erro e a mensagem é escolhida aqui, com o que a tela já sabe da
 * reserva.
 */

type Validation = inferRouterOutputs<AppRouter>['reservationValidation']

/** `lookup` devolve `null` para código que não resolve (WEB-316). */
export type ValidatedReservation = NonNullable<Validation['lookup']>
export type ArrivalResult = Validation['registerArrival']
export type UndoResult = Validation['undoArrival']

export type ValidationWindow = ValidatedReservation['window']
export type ValidatedGame = ValidatedReservation['event']

export type ValidationWindowStatus = 'not_open' | 'open' | 'closed'

type Notice = { title: string; detail: string }

/** Os limites são inclusivos, como em `isWithinValidationWindow`. */
export function getWindowStatus(
  window: ValidationWindow,
  now: number
): ValidationWindowStatus {
  if (now < new Date(window.opensAt).getTime()) return 'not_open'
  if (now > new Date(window.closesAt).getTime()) return 'closed'
  return 'open'
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/** "sáb., 12/09, 18:30", no fuso de quem está no balcão. */
export function formatDateTime(date: string | Date): string {
  return dateTimeFormat.format(new Date(date))
}

export function getWindowMessage(
  window: ValidationWindow,
  status: Exclude<ValidationWindowStatus, 'open'>
): Notice {
  return status === 'not_open'
    ? {
        title: 'Este código ainda não abriu',
        detail: `Ele vale de ${formatDateTime(window.opensAt)} até ${formatDateTime(window.closesAt)}.`
      }
    : {
        title: 'Este código expirou',
        detail: `Ele valia até ${formatDateTime(window.closesAt)}.`
      }
}

const STATUS_NOTICES: Record<
  Exclude<ValidatedReservation['reservationStatus'], 'confirmed'>,
  Notice
> = {
  // O código nasce com o pedido, antes de o dono responder: quem chega com
  // reserva pendente tem código de verdade.
  pending: {
    title: 'Esta reserva ainda não foi confirmada',
    detail:
      'O pedido está pendente de resposta do bar. Chegadas só são registradas em reserva confirmada.'
  },
  declined: {
    title: 'Esta reserva foi recusada',
    detail: 'O bar recusou o pedido. O código não registra chegadas.'
  },
  cancelled: {
    title: 'Esta reserva foi cancelada',
    detail: 'O torcedor cancelou o pedido. O código não registra chegadas.'
  }
}

/**
 * Por que este código não registra chegada agora, ou `null` se registra. A
 * tela inteira pergunta aqui — aviso, anúncio e botão —, para não existirem
 * três versões da mesma regra.
 */
export function getArrivalBlocker(
  reservation: Pick<ValidatedReservation, 'reservationStatus' | 'window'>,
  now: number
): Notice | null {
  if (reservation.reservationStatus !== 'confirmed') {
    return STATUS_NOTICES[reservation.reservationStatus]
  }
  const status = getWindowStatus(reservation.window, now)
  return status === 'open' ? null : getWindowMessage(reservation.window, status)
}

export function getGameTitle(
  game: Pick<
    ValidatedGame,
    'championship' | 'participants' | 'participantFreeText'
  >
): string {
  return (
    game.participants.join(' × ') ||
    game.participantFreeText ||
    game.championship
  )
}

export function getCounterLabel(usedCount: number, maxUses: number): string {
  return `${usedCount} de ${countLabel(maxUses, 'validado', 'validados')}`
}

export function getAllValidatedMessage(maxUses: number): string {
  return maxUses === 1
    ? 'A única pessoa desta reserva já foi validada.'
    : `As ${maxUses} pessoas desta reserva já foram validadas.`
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const code = (data as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/**
 * O servidor respondeu, recusando. Sem código é falha de transporte: não se
 * sabe se o pedido chegou, e repetir precisa reusar o mesmo `requestId`.
 */
export function wasAnsweredByServer(error: unknown): boolean {
  return errorCode(error) !== undefined
}

/** Mensagem da recusa pelo código de erro; o resto cai no padrão do WEB-118. */
function refusalMessage(
  error: unknown,
  byCode: Record<string, string>,
  fallback: string
): string {
  const messages: Record<string, string> = {
    FORBIDDEN: 'A validação de reservas é um recurso do plano Elite.',
    ...byCode
  }
  return (
    messages[errorCode(error) ?? ''] ?? getUserFacingMessage(error, fallback)
  )
}

export const CODE_NOT_FOUND_MESSAGE =
  'Código não encontrado. Confira com o torcedor e tente de novo.'

export function getLookupErrorMessage(error: unknown): string {
  return refusalMessage(
    error,
    // Código que não resolve chega como `null`, não como erro (WEB-316). O
    // `NOT_FOUND` fica para um servidor anterior a isso, depois de rollback.
    { NOT_FOUND: CODE_NOT_FOUND_MESSAGE },
    'Não foi possível buscar o código. Tente novamente.'
  )
}

export function getArrivalErrorMessage(
  error: unknown,
  reservation: Pick<ValidatedReservation, 'maxUses' | 'window'>,
  now: number
): string {
  // O servidor recusou pela janela. Se o relógio daqui ainda a vê aberta, ele
  // está atrasado: vale a recusa, e a janela fechou.
  const status = getWindowStatus(reservation.window, now)
  const { title, detail } = getWindowMessage(
    reservation.window,
    status === 'open' ? 'closed' : status
  )
  return refusalMessage(
    error,
    {
      CONFLICT: getAllValidatedMessage(reservation.maxUses),
      PRECONDITION_FAILED: `${title}. ${detail}`,
      NOT_FOUND: 'Este código deixou de valer. Busque o código de novo.',
      UNPROCESSABLE_CONTENT:
        'Esta reserva não está confirmada. Busque o código de novo.'
    },
    'Não foi possível registrar a chegada. Tente novamente.'
  )
}

export function getUndoErrorMessage(error: unknown): string {
  const expired = 'O prazo para desfazer esta chegada acabou.'
  return refusalMessage(
    error,
    { PRECONDITION_FAILED: expired, NOT_FOUND: expired },
    'Não foi possível desfazer a chegada. Tente novamente.'
  )
}
