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

export const env = schema.parse({
  EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY:
    process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || undefined
})
