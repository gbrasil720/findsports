import { getErrorCode, getUserFacingMessage } from '@/lib/user-facing-error'
import type { PolicyState } from './admin-model'

/*
 * Textos do "Novo jogo" travado e da exclusão recusada, lidos pela tela Jogos
 * do painel (`components/painel/jogos.tsx`).
 */

/**
 * `lapsedPlan` é o título do plano parado (`getLapsedPaidPlan`): Pro ou Elite
 * que caiu no limite do Starter lê por que parou, não "limite do plano"
 * (WEB-331).
 */
export function getCreateBlockReason(
  policyState: PolicyState,
  lapsedPlan?: string | null
): string | null {
  if (policyState.status === 'loading') return 'Verificando disponibilidade…'
  if (policyState.status === 'error') {
    return 'Não foi possível verificar a disponibilidade.'
  }
  if (policyState.policy.status === 'inactive') {
    return 'Ative um plano para adicionar eventos.'
  }
  if (!policyState.policy.canCreate) {
    return lapsedPlan
      ? `${lapsedPlan}: limite de jogos atingido.`
      : 'Limite do plano atingido.'
  }
  return null
}

export function getDeleteErrorMessage(error: unknown): string {
  // Chegou código ou avaliação depois que a grade carregou.
  if (getErrorCode(error) === 'PRECONDITION_FAILED') {
    return 'Este jogo já tem código de quem vai ou avaliação e não pode mais ser excluído.'
  }
  return getUserFacingMessage(
    error,
    'Não foi possível excluir o jogo. Tente novamente.'
  )
}
