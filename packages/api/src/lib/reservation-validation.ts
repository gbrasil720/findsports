import { getValidationWindow } from '@findsports_oficial/db/event-window'
import type { ReservationStatus } from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { COMMERCIAL_TIME_ZONE } from './commercial-analytics/commercial-day'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'
import type { JanelaLimite } from './waitlist-rate-limit'

/**
 * Regras da validação de código de reserva (WEB-126) que não dependem do
 * banco. O router só orquestra: quem pode, quando vale e o que se responde
 * sai daqui.
 */

/**
 * Teto de códigos ERRADOS por conta de bar. Código que resolve devolve a
 * tentativa, então noite de clássico com cinquenta reservas não esbarra aqui;
 * só quem erra em sequência.
 *
 * A chave é a conta, não a sessão: limite por sessão se zera abrindo outra
 * aba anônima e entrando de novo.
 */
export const VALIDATION_ATTEMPT_LIMIT: JanelaLimite = {
  max: 10,
  windowMs: 10 * 60_000
}

export function validationAttemptKey(userId: string): string {
  return `reservation-validation:user:${userId}`
}

/**
 * Folga do servidor sobre `ARRIVAL_UNDO_WINDOW_MS`: a tela esconde o botão no
 * prazo, e o clique dado no último segundo ainda atravessa a rede.
 */
export const ARRIVAL_UNDO_GRACE_MS = 5_000

export function canValidateReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  return getCurrentPlan(subscription, now) === 'elite'
}

/**
 * Depende só da assinatura de quem chama, nunca do código digitado: recusar
 * aqui não revela nada sobre código nenhum.
 */
export function assertCanValidateReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canValidateReservations(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A validação de reservas é um recurso do plano Elite.'
    })
  }
}

/**
 * A ÚNICA resposta para "este código não é seu": inexistente, aposentado ou
 * de outro bar. Um construtor só, para que ninguém
 * escreva uma segunda mensagem e entregue um oráculo de enumeração.
 */
export function codeNotFoundError(): TRPCError {
  return new TRPCError({
    code: 'NOT_FOUND',
    message: 'Código não encontrado. Confira com o torcedor e tente de novo.'
  })
}

export function tooManyAttemptsError(): TRPCError {
  return new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message:
      'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'
  })
}

/**
 * O código nasce junto com o pedido (ADR 0003), então o torcedor pode chegar
 * com código de reserva que o dono ainda não respondeu. O código resolve e a
 * tela mostra o estado; chegada só se registra em reserva confirmada, porque
 * a confirmação manual é a única defesa do bar contra overbooking.
 */
export function assertReservationConfirmed(status: ReservationStatus): void {
  if (status === 'confirmed') return
  throw new TRPCError({
    code: 'UNPROCESSABLE_CONTENT',
    message:
      status === 'pending'
        ? 'Esta reserva ainda não foi confirmada pelo bar.'
        : status === 'declined'
          ? 'Esta reserva foi recusada pelo bar.'
          : 'Esta reserva foi cancelada pelo torcedor.'
  })
}

export type ValidationWindowStatus = 'not_open' | 'open' | 'closed'

export type ValidationWindowState = {
  status: ValidationWindowStatus
  opensAt: Date
  closesAt: Date
}

export function getValidationWindowState(
  event: { startsAt: Date; endsAt: Date | null },
  now = new Date()
): ValidationWindowState {
  const { opensAt, closesAt } = getValidationWindow(event)
  const nowMs = now.getTime()
  const status: ValidationWindowStatus =
    nowMs < opensAt.getTime()
      ? 'not_open'
      : nowMs > closesAt.getTime()
        ? 'closed'
        : 'open'
  return { status, opensAt, closesAt }
}

const windowDateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: COMMERCIAL_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/** "12/09, 18:30", no fuso em que os bares operam. */
export function formatWindowDate(date: Date): string {
  return windowDateFormat.format(date)
}

export function assertWindowOpen(state: ValidationWindowState): void {
  if (state.status === 'open') return
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message:
      state.status === 'not_open'
        ? `Este código ainda não abriu. Ele vale a partir de ${formatWindowDate(state.opensAt)}.`
        : `Este código expirou. Ele valia até ${formatWindowDate(state.closesAt)}.`
  })
}

const CHECK_VIOLATION = '23514'

function pgField(error: unknown, field: 'code' | 'constraint') {
  let current: unknown = error
  while (current && typeof current === 'object') {
    const value = (current as Record<string, unknown>)[field]
    if (typeof value === 'string') return value
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

/**
 * Traduz a recusa do banco ao gravar um uso (migrations 0033 e 0034) pelo nome
 * da regra, nunca pelo texto da mensagem. Devolve `null` para o que não for
 * regra conhecida — o erro original segue adiante.
 */
export function translateArrivalWriteError(
  error: unknown,
  maxUses: number
): TRPCError | null {
  if (pgField(error, 'code') !== CHECK_VIOLATION) return null
  const constraint = pgField(error, 'constraint')

  if (constraint === 'reservation_code_used_count_bounds') {
    return new TRPCError({
      code: 'CONFLICT',
      message:
        maxUses === 1
          ? 'A única pessoa desta reserva já foi validada.'
          : `As ${maxUses} pessoas desta reserva já foram validadas.`
    })
  }
  // Aposentado entre a busca e o `+1`: para quem digita, deixou de existir.
  if (constraint === 'reservation_code_use_code_not_retired') {
    return codeNotFoundError()
  }
  return null
}
