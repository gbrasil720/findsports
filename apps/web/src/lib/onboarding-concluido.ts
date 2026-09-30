import { getErrorCode } from '@/lib/user-facing-error'

/**
 * `onboarding.completePub` e `completeFan` recusam com `CONFLICT` quando a
 * conta já concluiu — duplo envio, ou outra aba que chegou antes. Não é
 * falha a corrigir: a tela segue o caminho do sucesso, só avisando o que
 * houve.
 */
export function mensagemOnboardingJaConcluido(error: unknown): string | null {
  return getErrorCode(error) === 'CONFLICT'
    ? 'Seu cadastro já estava concluído.'
    : null
}
