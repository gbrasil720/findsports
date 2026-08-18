import { dodopaymentsClient } from '@dodopayments/better-auth'
import type { auth } from '@findsports_oficial/auth'
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient(),
    dodopaymentsClient()
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
 */
export async function refreshSessionCache() {
  await authClient.getSession({ query: { disableCookieCache: true } })
}
