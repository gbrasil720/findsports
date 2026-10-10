import type { SubscriptionPlan } from '@findsports_oficial/db'
import { authClient } from './auth-client'
import { planChangeReturnUrl } from './plan-catalog'

/**
 * Cobrança pelo plugin do Stripe no better-auth (WEB-31).
 *
 * Quem chama NÃO navega com o retorno: as duas rotas respondem
 * `redirect: true`, e o cliente do better-auth (`redirectPlugin`) já faz
 * `window.location.href` com a URL antes de a função resolver. Um segundo
 * `location.href` abortava a primeira navegação (WEB-241). O retorno só diz
 * se há para onde ir; `false` é o caso de mostrar erro.
 */

/**
 * Abre a contratação do plano. Para quem ainda não tem assinatura no Stripe é
 * o checkout; para quem já tem, a confirmação da troca de plano no portal —
 * o servidor decide, e nunca abre uma segunda assinatura.
 */
export async function startCheckout(
  plan: SubscriptionPlan,
  // Plano vigente de quem troca: o retorno do portal leva a troca pedida, e
  // `/admin/billing` confere se ela aconteceu (WEB-351).
  currentPlan?: SubscriptionPlan | null
): Promise<boolean> {
  const { data, error } = await authClient.subscription.upgrade({
    plan,
    // Idioma do checkout. A confirmação de troca no portal não recebe isto do
    // plugin e segue o idioma do navegador do dono.
    locale: 'pt-BR',
    successUrl: '/plan/confirmed',
    cancelUrl: '/plan',
    returnUrl:
      currentPlan && currentPlan !== plan
        ? planChangeReturnUrl(currentPlan, plan)
        : '/admin/billing'
  })
  if (error) throw error
  return typeof data?.url === 'string'
}

/** Abre o portal do Stripe: cartão, faturas, troca de plano e cancelamento. */
export async function openBillingPortal(): Promise<boolean> {
  const { data, error } = await authClient.subscription.billingPortal({
    locale: 'pt-BR',
    returnUrl: '/admin/billing'
  })
  if (error) throw error
  return typeof data?.url === 'string'
}

/**
 * Abre o portal do Stripe direto no cancelamento da assinatura (WEB-339); a
 * pesquisa de motivo e a confirmação são as do portal. A rota do plugin não
 * recebe idioma: como a confirmação de troca de plano, a tela segue o do
 * navegador do dono.
 */
export async function openSubscriptionCancel(): Promise<boolean> {
  const { data, error } = await authClient.subscription.cancel({
    returnUrl: '/admin/billing'
  })
  if (error) throw error
  return typeof data?.url === 'string'
}
