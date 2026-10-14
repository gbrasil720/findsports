import { expoClient } from '@better-auth/expo/client'
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
    })
  ]
})
