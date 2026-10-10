import { stripeClient } from '@better-auth/stripe/client'
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
    stripeClient({ subscription: true }),
    // Tipa `authClient.revokeSessionById` (WEB-150) e `expireSessionCache`.
    {
      id: 'session-token-guard',
      $InferServerPlugin: {} as ReturnType<typeof sessionTokenGuard>,
      // Chamada sem corpo sairia como GET.
      pathMethods: { '/expire-session-cache': 'POST' }
    } satisfies BetterAuthClientPlugin
  ]
})

/**
 * Descarta o cookie de cache da sessão: a requisição seguinte relê o banco.
 *
 * Necessário depois de qualquer mutação que altere campos da sessão usados
 * pelos guards de rota (`role`, `onboardingCompleted`) por fora do
 * better-auth — hoje, só o onboarding, que escreve em `user` pelo Drizzle.
 * Sem isto o guard leria o estado antigo por até `cookieCache.maxAge` e
 * devolveria o usuário ao onboarding que ele acabou de concluir.
 *
 * Expira em vez de reler (WEB-324): `getSession` com `disableCookieCache` não
 * regrava o cache de sessão "não lembrar de mim", que é a da impersonação.
 *
 * Nunca rejeita: quem chama já gravou a mutação, e uma falha aqui (rede) não
 * pode virar erro dela. O guard revalida no servidor; o pior caso é ver o
 * onboarding de novo.
 *
 * É a segunda tentativa: `onboarding.completePub` e `completeFan` já expiram
 * o cookie na própria resposta. Sozinho, este pedido deixava na revisão, com
 * o bar criado, quem o tivesse perdido.
 */
export async function refreshSessionCache() {
  await authClient.expireSessionCache().catch(() => {})
}
