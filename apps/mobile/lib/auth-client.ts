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
import { env } from './env'

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
      user: { role: { type: 'string', required: false } }
    }),
    twoFactorClient()
  ]
})

const storage = storageAdapter(SecureStore)

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

/** Onde a tela de senha nova acha o e-mail, para entrar logo depois. */
export const RESET_EMAIL_KEY = 'onside.reset-email'
