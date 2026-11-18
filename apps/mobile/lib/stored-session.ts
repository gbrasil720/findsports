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

/*
 * Sem nada no `onside_session_data` (instalação de antes do cache do plugin,
 * ou cache apagado) não há sessão para manter: só o cookie, que o plugin
 * guarda em `onside_cookie` como `{ "<nome>": { value, expires } }`. Com o
 * cookie da sessão ainda válido e uma falha passageira, a conta continua no
 * aparelho, só sem os dados: a tela diz que o sinal caiu em vez de tratar a
 * pessoa como visitante. Nome, papel e o resto só vêm do servidor.
 */

/**
 * A conta está no aparelho, mas a leitura falhou sem o servidor responder?
 * `before` é a resposta anterior: durante a releitura o erro some do estado
 * (`isRefetching`), e a tela não pode piscar para visitante a cada tentativa.
 */
export function accountWithoutData(
  state: ReadState,
  rawCookie: string | null,
  before = false,
  now = Date.now()
): boolean {
  if (state.data) return false
  if (state.isRefetching || state.isPending) return before
  if (!state.error || getErrorStatus(state.error) === 401) return false
  if (!isTransientError(state.error)) return false
  return hasSessionCookie(rawCookie, now)
}

function hasSessionCookie(raw: string | null, now: number) {
  if (!raw) return false
  try {
    const cookies: Record<string, { value?: string; expires?: string | null }> =
      JSON.parse(raw) ?? {}
    return Object.entries(cookies).some(
      ([name, cookie]) =>
        name.endsWith('.session_token') &&
        Boolean(cookie?.value) &&
        (!cookie.expires || new Date(cookie.expires).getTime() > now)
    )
  } catch {
    return false
  }
}

/*
 * A leitura da sessão só vale se veio da API. Duas redes enganam o cliente:
 *
 * - Portal de Wi-Fi (hotel, aeroporto) responde 200 com a página dele. O
 *   cliente lê o HTML como dado, e o plugin do Expo o grava por cima do
 *   `onside_session_data` antes de qualquer regra nossa: a pessoa saía da
 *   conta sem o servidor ter dito nada.
 * - Servidor que aceita a conexão e não responde: o iOS só desiste depois de
 *   ~60 s, e a abertura fica vazia esse tempo todo.
 *
 * O `fetch` do cliente passa por aqui (`fetchOptions.customFetchImpl` em
 * `lib/auth-client.ts`): em `/get-session`, resposta 200 que não é sessão nem
 * `null`, ou sem resposta em `SESSION_TIMEOUT_MS`, vira erro de rede, que
 * `isTransientError` lê como passageiro. O plugin não grava nada (só grava no
 * sucesso) e `sessionToKeep`/`accountWithoutData` decidem como em qualquer
 * queda. As outras rotas seguem sem mudança.
 */

/** Teto da leitura da sessão: acima disso, conta como sem rede. */
export const SESSION_TIMEOUT_MS = 8000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown) => typeof value === 'string' && value !== ''

/**
 * `true` se o corpo de um 200 de `/get-session` veio mesmo da API: `null`
 * (sem sessão) ou a sessão do better-auth, com `session.id`, `userId` igual a
 * `user.id` e `expiresAt` em data. O servidor não manda o `token`.
 */
export function isSessionBody(text: string): boolean {
  // Sem corpo, o cliente lê `null` (sem sessão).
  if (!text) return true
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return false
  }
  if (body === null) return true
  if (!isRecord(body) || !isRecord(body.session) || !isRecord(body.user))
    return false
  const { session, user } = body
  return (
    isId(session.id) &&
    isId(user.id) &&
    session.userId === user.id &&
    typeof session.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(session.expiresAt))
  )
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function sessionFetch(
  fetchImpl: Fetch = fetch,
  timeoutMs = SESSION_TIMEOUT_MS
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    if (!url.includes('/get-session')) return fetchImpl(input, init)

    const controller = new AbortController()
    const outer = init?.signal
    const abort = () => controller.abort()
    if (outer?.aborted) abort()
    outer?.addEventListener('abort', abort)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      abort()
    }, timeoutMs)
    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal
      })
      if (!response.ok) return response
      // O corpo também conta no teto: o portal pode mandar o cabeçalho e parar.
      const text = await response.text()
      if (!isSessionBody(text))
        throw new TypeError('Network request failed: resposta fora da API')
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (error) {
      if (timedOut) throw new TypeError('Network request timed out')
      throw error
    } finally {
      clearTimeout(timer)
      outer?.removeEventListener('abort', abort)
    }
  }
}
