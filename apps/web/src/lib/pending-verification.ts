/**
 * E-mail de quem acabou de se cadastrar e ainda não confirmou. Fica no
 * `sessionStorage` da aba do cadastro: com `autoSignIn: false` não há sessão
 * até a confirmação, e é por ele que `/verify-email` e o onboarding do bar
 * sabem de quem é a aba.
 */
export const PENDING_VERIFICATION_KEY = 'onside:pending-verification'

export function readPendingEmail(): string {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    const pending = JSON.parse(
      sessionStorage.getItem(PENDING_VERIFICATION_KEY) ?? '{}'
    ) as { email?: unknown }
    return typeof pending.email === 'string' ? pending.email : ''
  } catch {
    return ''
  }
}
