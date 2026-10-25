import {
  type ActionPhase,
  getErrorStatus,
  isTransientError
} from '@findsports_oficial/api/lib/transient-error'

/*
 * As telas de conta (entrar, cadastro, senha, duas etapas) diante da rede
 * (WEB-469). Puro: o teste roda sem o cliente do better-auth.
 */

/** A falha de uma chamada do better-auth, com ou sem resposta do servidor. */
export type AuthFailure = {
  code?: string
  message?: string
  status: number
  statusText: string
}

/**
 * O better-auth devolve `{ error }` quando o servidor recusa, mas lança quando
 * o `fetch` nem chega a ele (sem rede, servidor fora do alcance): o `await`
 * estourava e o botão ficava em "Entrando…" para sempre. Aqui as duas viram
 * `{ error }`; a sem resposta sai com `status: 0`, que `isTransientError` lê
 * como passageira.
 */
export async function settle<T>(
  call: Promise<T>
): Promise<T | { data: null; error: AuthFailure }> {
  try {
    return await call
  } catch (error) {
    return {
      data: null,
      error: {
        status: 0,
        statusText: '',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/** A requisição não chegou ao servidor. */
export const unreachable = (error: unknown) => getErrorStatus(error) === 0

/**
 * Vale o botão "Tentar de novo": a falha é passageira e repetir agora pode dar
 * certo. O 429 é passageiro, mas a frase dele pede para esperar.
 */
export const retryable = (error: unknown) =>
  isTransientError(error) && getErrorStatus(error) !== 429

/**
 * A fase do botão (`phaseLabel`): "Entrando…" na primeira vez, "Tentar de
 * novo" depois de uma falha passageira e "Tentando de novo…" ao repetir.
 * Sem nova tentativa sozinha: o token do Turnstile vale uma vez e o limite de
 * tentativas do servidor conta cada envio.
 */
export function attemptPhase(pending: boolean, failed: boolean): ActionPhase {
  if (pending) return failed ? 'retrying' : 'sending'
  return failed ? 'failed' : 'idle'
}
