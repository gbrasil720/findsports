import Constants from 'expo-constants'
import { z } from 'zod'

// `EXPO_PUBLIC_*` é embutida no bundle do app pelo Expo, e só quando lida
// assim, por nome inteiro. Nada aqui é segredo: é o equivalente das `VITE_*`
// do web (`apps/web/src/lib/env.ts`).
const schema = z.object({
  EXPO_PUBLIC_SERVER_URL: z.url(),
  // Chave pública do Turnstile, a mesma `VITE_TURNSTILE_SITE_KEY` do web. Sem
  // ela o app não mostra o desafio (o servidor só o exige quando tem a secreta).
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional()
})

const parsed = schema.parse({
  EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY:
    process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || undefined
})

/**
 * Em desenvolvimento, `localhost` no celular é o próprio celular. O Expo sabe
 * por qual endereço o aparelho alcançou o Metro (`hostUri`, o IP do Mac na
 * rede): o servidor do web está na mesma máquina, então `localhost` vira esse
 * endereço. No simulador `hostUri` já é `localhost` e nada muda; fora de
 * desenvolvimento a URL configurada vale como está.
 */
function reachableServerUrl(configured: string): string {
  if (!__DEV__) return configured
  const url = new URL(configured)
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0]
  if (url.hostname !== 'localhost' || !metroHost) return configured
  url.hostname = metroHost
  return url.origin
}

export const env = {
  ...parsed,
  EXPO_PUBLIC_SERVER_URL: reachableServerUrl(parsed.EXPO_PUBLIC_SERVER_URL)
}

/** "v0.1.0": a versão do app (`app.json`), no rodapé do "Você" e da entrada. */
export const APP_VERSION = `v${Constants.expoConfig?.version ?? ''}`

/** "Ajuda e contato": o mesmo endereço do site. */
export const HELP_URL = 'mailto:contato@onside.sh'
