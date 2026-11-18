import {
  expoClient,
  getSetCookie,
  storageAdapter
} from '@better-auth/expo/client'
import {
  inferAdditionalFields,
  twoFactorClient
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { useRef } from 'react'
import { roleToStore } from './account-role'
import { env } from './env'
import { queryClient } from './query-client'
import {
  accountWithoutData,
  sessionStep,
  type sessionToKeep
} from './stored-session'

// O mesmo better-auth do web, em `<servidor>/api/auth`. No app não há cookie
// de navegador: o plugin do Expo guarda a sessão no SecureStore e a repassa
// em cada chamada (ver `lib/trpc.ts`).
const scheme = Constants.expoConfig?.scheme as string

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_SERVER_URL,
  plugins: [
    expoClient({
      scheme,
      storagePrefix: scheme,
      storage: SecureStore
    }),
    // O papel vai no cadastro (`fan` ou `pub`, ver `allow-role-on-signup` no
    // servidor).
    inferAdditionalFields({
      user: {
        role: { type: 'string', required: false },
        onboardingCompleted: { type: 'boolean', required: false },
        // Raio da busca do Explorar, escolhido no onboarding.
        searchRadiusKm: { type: 'number', required: false }
      }
    }),
    twoFactorClient()
  ]
})

// Leitura da sessão que falhou sem o servidor responder (sem rede, 5xx): fica
// a guardada no aparelho, mesmo vencida, em vez de virar visitante. A regra e
// o porquê estão em `lib/stored-session.ts`; todas as telas leem por aqui, pelo
// `useSession` (`app/index.tsx`, a aba Você, `useFan`, `useWithAccount`).
// Pelo `storageAdapter`, como o plugin: sessão grande vai em pedaços.
const storage = storageAdapter(SecureStore)
const sessionKey = `${scheme}_session_data`
const sessionAtom = authClient.$store.atoms.session
let restored: ReturnType<typeof sessionToKeep> = null
sessionAtom.listen((state) => {
  const step = sessionStep(state, storage.getItem(sessionKey), restored)
  restored = step.restored
  // O mesmo que o plugin grava ao sair (`clearSessionCache`).
  if (step.clearCache) storage.setItem(sessionKey, '{}')
  if (step.set !== undefined) sessionAtom.set({ ...state, data: step.set })
})

// O papel da última sessão boa (torcedor ou bar), para a conta sem dados
// saber de quem são as telas (WEB-538, `lib/account-role.ts`). Sai com a
// conta: 401, ou o servidor sem sessão.
const ROLE_KEY = 'onside.papel'
sessionAtom.subscribe((state) => {
  const role = roleToStore(state)
  if (role === undefined || role === SecureStore.getItem(ROLE_KEY)) return
  ;(role
    ? SecureStore.setItemAsync(ROLE_KEY, role)
    : SecureStore.deleteItemAsync(ROLE_KEY)
  ).catch(() => {})
})

/** O papel guardado da última sessão boa (`fan`, `pub`) ou `null`. */
export const readStoredRole = () => SecureStore.getItem(ROLE_KEY)

/**
 * Adota a sessão que volta pelo link do e-mail de confirmação. O link abre no
 * navegador; o servidor confirma, entra e redireciona para o app com o
 * `Set-Cookie` no parâmetro `cookie` (plugin `expo()`, rota `/verify-email`).
 * O cliente só faz isso sozinho no login social, então aqui é à mão, na mesma
 * chave e no mesmo formato que ele usa.
 */
export async function adoptSessionCookie(setCookie: string) {
  const key = `${scheme}_cookie`
  await storage.setItem(
    key,
    getSetCookie(setCookie, storage.getItem(key) ?? undefined)
  )
  authClient.$store.notify('$sessionSignal')
}

/**
 * Há sessão guardada no aparelho? Lido direto do SecureStore (síncrono): na
 * partida o `getCookie()` do cliente ainda pode estar vazio.
 */
export const hasStoredSession = () =>
  Boolean(SecureStore.getItem(`${scheme}_cookie`))

/**
 * A conta está no aparelho (cookie de sessão válido), mas a sessão não veio
 * porque o servidor não respondeu e não há dados guardados para mostrar. As
 * telas tratam como conta sem dados ("Sinal caiu"), nunca como visitante;
 * a regra está em `lib/stored-session.ts`. A biblioteca relê a sessão no
 * primeiro plano e com a rede de volta.
 */
export function useAccountWithoutData() {
  const state = authClient.useSession()
  const before = useRef(false)
  before.current = accountWithoutData(
    state,
    storage.getItem(`${scheme}_cookie`),
    before.current
  )
  return before.current
}

/**
 * Relê a sessão do banco. O servidor guarda a sessão num cookie por 60 s, e o
 * onboarding grava `onboardingCompleted` por fora do better-auth: sem
 * descartar o cache, o app continuaria vendo o onboarding como pendente. É o
 * `refreshSessionCache` do web.
 */
export async function refreshSession() {
  // Corpo `{}`: sem JSON o servidor recusa com 415.
  await authClient
    .$fetch('/expire-session-cache', { method: 'POST', body: {} })
    .catch(() => {})
  await authClient.getSession({ query: { disableCookieCache: true } })
  authClient.$store.notify('$sessionSignal')
  // Nome, foto e raio mudam por aqui, fora das mutations do tRPC: o cache
  // vence do mesmo jeito (ver `lib/query-client.ts`).
  queryClient.invalidateQueries({ refetchType: 'none' })
}
