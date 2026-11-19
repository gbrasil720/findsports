import {
  getErrorStatus,
  isTransientError
} from '@findsports_oficial/api/lib/transient-error'

/*
 * Quem tem conta não vira visitante porque o servidor sumiu (WEB-538). Puro:
 * o teste roda sem o cliente do better-auth.
 *
 * O plugin do Expo guarda a última resposta de `/get-session` no SecureStore
 * (`onside_session_data`) e o cliente nasce com ela, mas só se ainda não
 * venceu. Vencida (mais de 7 dias sem renovar) e com o servidor fora do ar, a
 * primeira leitura falhava e a pessoa virava visitante sem o servidor ter dito
 * nada. A regra: só a resposta do servidor tira da conta (401, ou 200 sem
 * sessão); falha passageira (sem rede, timeout, 5xx, a página de erro da
 * borda) mantém a sessão guardada, vencida ou não, e as telas mostram o erro de
 * carregamento. Quando o servidor voltar, a releitura (primeiro plano, rede de
 * volta) decide: sessão vencida ou revogada sai ali.
 */

type StoredSession = { user: { id: string }; session: { id: string } }

type SessionState = { data: unknown; error: unknown; isPending: boolean }

/**
 * A sessão guardada que o app adota depois de uma leitura que falhou, ou
 * `null` para deixar como está. `raw` é o `onside_session_data` do aparelho.
 */
export function sessionToKeep<T extends StoredSession>(
  state: SessionState,
  raw: string | null
): T | null {
  // Ainda lendo, ou já com sessão: nada a fazer.
  if (state.isPending || state.data) return null
  // Sem erro, o servidor respondeu "sem sessão": vira visitante.
  if (!state.error) return null
  if (getErrorStatus(state.error) === 401) return null
  if (!isTransientError(state.error)) return null
  return parseStored<T>(raw)
}

function parseStored<T extends StoredSession>(raw: string | null): T | null {
  if (!raw) return null
  try {
    const cached = JSON.parse(raw)
    return cached?.user?.id && cached?.session?.id ? cached : null
  } catch {
    return null
  }
}

type ReadState = SessionState & { isRefetching?: boolean }

/**
 * O passo do `listen` da sessão. `restored` é a sessão que o app pôs no lugar
 * numa falha passageira: só ela some depois, quando o servidor recusa sem ser
 * passageiro (o better-auth mantém `data` num 403). Sessão que o servidor
 * mandou zera `restored`. Um 401 também apaga o cache (`clearCache`), senão a
 * próxima queda traria de volta a sessão recusada.
 */
export function sessionStep<T extends StoredSession>(
  state: ReadState,
  raw: string | null,
  restored: T | null
): { set?: T | null; restored: T | null; clearCache: boolean } {
  if (state.isPending || state.isRefetching)
    return { restored, clearCache: false }
  const clearCache = Boolean(state.error) && getErrorStatus(state.error) === 401
  if (restored && state.data === restored) {
    if (state.error && !isTransientError(state.error))
      return { set: null, restored: null, clearCache }
    return { restored, clearCache }
  }
  if (state.data) return { restored: null, clearCache }
  const kept = sessionToKeep<T>(state, clearCache ? null : raw)
  return kept
    ? { set: kept, restored: kept, clearCache }
    : { restored: null, clearCache }
}
