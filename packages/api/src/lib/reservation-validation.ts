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

/**
 * Depende só da assinatura de quem chama, nunca do código digitado: recusar
 * aqui não revela nada sobre código nenhum.
 */
export function assertCanValidateReservations(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (getCurrentPlan(subscription, now) !== 'elite') {
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

/** "12/09, 18:30", no fuso em que os bares operam. */
const windowDateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: COMMERCIAL_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/** Os dois limites da janela são inclusivos. */
export function assertWindowOpen(
  event: { startsAt: Date; endsAt: Date | null },
  now = new Date()
): void {
  const { opensAt, closesAt } = getValidationWindow(event)
  if (now < opensAt) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Este código ainda não abriu. Ele vale a partir de ${windowDateFormat.format(opensAt)}.`
    })
  }
  if (now > closesAt) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Este código expirou. Ele valia até ${windowDateFormat.format(closesAt)}.`
    })
  }
}

const CHECK_VIOLATION = '23514'

export function pgField(error: unknown, field: 'code' | 'constraint') {
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
