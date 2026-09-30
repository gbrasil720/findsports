import { dodopaymentsClient } from '@dodopayments/better-auth'
import type { auth } from '@findsports_oficial/auth'
import type { sessionTokenGuard } from '@findsports_oficial/auth/session-token'
import type { BetterAuthClientPlugin } from 'better-auth/client'
import {
  adminClient,
  inferAdditionalFields,
  twoFactorClient
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    twoFactorClient(),
    adminClient(),
    dodopaymentsClient(),
    // Tipa `authClient.revokeSessionById` (WEB-150).
    {
      id: 'session-token-guard',
      $InferServerPlugin: {} as ReturnType<typeof sessionTokenGuard>
    } satisfies BetterAuthClientPlugin
  ]
})

/**
 * Relê a sessão no banco e regrava o cookie de cache com o estado novo.
 *
 * Necessário depois de qualquer mutação que altere campos da sessão usados
 * pelos guards de rota (`role`, `onboardingCompleted`) por fora do
 * better-auth — hoje, só o onboarding, que escreve em `user` pelo Drizzle.
 * Sem isto o guard leria o estado antigo por até `cookieCache.maxAge` e
 * devolveria o usuário ao onboarding que ele acabou de concluir.
 *
 * Nunca rejeita: quem chama já gravou a mutação, e uma falha aqui (rede) não
 * pode virar erro dela. O guard revalida no servidor; o pior caso é ver o
 * onboarding de novo.
 */
export async function refreshSessionCache() {
  await authClient
    .getSession({ query: { disableCookieCache: true } })
    .catch(() => {})
}
