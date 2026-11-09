import { getUserFacingMessage } from '@/lib/user-facing-error'

const RULE_CODES = new Set(['BAD_REQUEST', 'CONFLICT', 'PRECONDITION_FAILED'])

/**
 * Recusa de regra do servidor (400, 409, 412) já vem escrita para quem opera:
 * "Este jogo tem 1 reserva ativa…", "O e-mail dessa pessoa já está
 * verificado.". O texto padrão de `getUserFacingMessage` esconderia o motivo.
 * Entrada recusada pelo zod (o JSON da validação) e o resto seguem o padrão.
 */
export function refusalMessage(error: unknown, fallback: string) {
  const code = (error as { data?: { code?: string } | null } | null)?.data?.code
  if (
    code &&
    RULE_CODES.has(code) &&
    error instanceof Error &&
    !/^\s*[[{]/.test(error.message)
  ) {
    return error.message
  }
  return getUserFacingMessage(error, fallback)
}
