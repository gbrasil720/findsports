/**
 * Estado de um convite da waitlist (ONS-25).
 *
 * Antes a query de `inviteDetails` filtrava expiração, ativação, aprovação e
 * cancelamento de uma vez só: zero linha, e a única resposta possível era
 * "Convite inválido ou expirado." — a mesma frase para cinco situações que
 * pedem saídas diferentes. Quem já tinha conta ativa lia que o convite era
 * inválido, quando bastava mandar a pessoa para o login.
 *
 * Aqui a busca é só pelo hash e o motivo é derivado dos campos da linha. A
 * decisão fica nesta função pura para poder ser testada sem banco.
 */

export type WaitlistInviteStatus =
  | 'valid'
  | 'expired'
  | 'activated'
  | 'not_approved'
  | 'cancelled'
  | 'not_found'

export type WaitlistInviteFlags = {
  cancelled: boolean
  activated: boolean
  approved: boolean
  /** `invite_expires_at` existe e ainda está no futuro. */
  inviteFresh: boolean
}

/**
 * A ordem é a da precedência real, não a da tabela:
 *
 * - cancelado vem primeiro porque `leave` zera `approved_at` e
 *   `invite_expires_at` junto; sem esta prioridade, quem saiu da lista leria
 *   "ainda na fila".
 * - ativado vem antes de aprovado porque é o estado mais útil de informar:
 *   a conta existe e o caminho é `/login`.
 * - "expirado" é o último dos motivos de recusa: só faz sentido oferecer
 *   reenvio para quem está aprovado, não cancelado e sem conta ativada — que
 *   é exatamente o que `resendInvite` aceita.
 */
export function deriveWaitlistInviteStatus(
  flags: WaitlistInviteFlags
): Exclude<WaitlistInviteStatus, 'not_found'> {
  if (flags.cancelled) return 'cancelled'
  if (flags.activated) return 'activated'
  if (!flags.approved) return 'not_approved'
  if (!flags.inviteFresh) return 'expired'
  return 'valid'
}
