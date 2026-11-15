type BillingUser = {
  role?: string | null
  emailVerified?: boolean | null
}

/**
 * Rotas de cobrança do plugin do Stripe que pedem bar com e-mail verificado:
 * checkout, troca de plano, portal, cancelamento. O webhook (`/stripe/webhook`)
 * fica de fora — quem chama é o Stripe, sem sessão, e a prova é a assinatura.
 */
export function requiresPubBillingAccess(path: string): boolean {
  return path.startsWith('/subscription/')
}

/**
 * Rotas do plugin que o app não usa e que gravam no Stripe ou no banco:
 * `/subscription/cancel` apaga a linha de `stripe_subscription` quando a
 * assinatura não está `active` nem `trialing`, e sem ela a troca seguinte
 * abriria uma segunda assinatura (o cancelamento é pelo portal,
 * `createSubscriptionCancelUrl`); `/subscription/restore` desfaz no Stripe um
 * cancelamento agendado sem passar pelo portal. `/subscription/success` fica:
 * é a volta do checkout do plugin.
 */
const UNUSED_BILLING_ROUTES = new Set([
  '/subscription/cancel',
  '/subscription/restore'
])

export function isUnusedBillingRoute(path: string): boolean {
  return UNUSED_BILLING_ROUTES.has(path)
}

/**
 * Troca de plano numa assinatura do cartão que já existe fica no intervalo
 * dela (WEB-442): o plugin acha o preço só pelo `annual` do pedido, e uma
 * anual trocada sem ele viraria mensal levando o cupom anual (R$ 280 por
 * fatura) para cada mês. `current` é o intervalo da assinatura viva, ou
 * `null` sem assinatura no cartão.
 */
export function changesBillingInterval(
  current: string | null,
  annual: boolean
): boolean {
  return current !== null && (current === 'year') !== annual
}

export function canAccessPubBilling(user: BillingUser | null): boolean {
  return user?.role === 'pub' && user.emailVerified === true
}

type SubscriptionForCheckout = {
  status: string
  externalSubscriptionId: string | null
} | null

/**
 * Assinatura que impede abrir um checkout novo (WEB-172): a que existe no
 * provedor e está com pagamento pendente. Um checkout criaria uma segunda
 * assinatura, e a primeira voltaria a cobrar quando o cartão fosse corrigido.
 * O caminho é regularizar a que já existe, no portal.
 *
 * As demais não passam por aqui porque o plugin do Stripe já as resolve sem
 * checkout: assinatura viva (`active` ou `trialing`) vira troca de plano na
 * mesma assinatura. Teste grátis do cadastro e assinatura encerrada não têm
 * nada no provedor a duplicar, e a pausada (`inactive`) não gera fatura.
 */
export function blocksNewCheckout(
  subscription: SubscriptionForCheckout
): boolean {
  return (
    subscription?.status === 'past_due' &&
    subscription.externalSubscriptionId !== null
  )
}

/**
 * Cartão por cima de um Pix ativo pelo checkout do plugin (WEB-536): a
 * passagem do Pix para o cartão é a sessão própria (`startCardFromPix`), que
 * cobra a diferença da subida na hora e confere a chave da AbacatePay. Pelo
 * plugin, o bar trocaria de plano sem pagar a diferença ou pagaria os dois.
 */
export function blocksCardOverPix(
  subscription: {
    status: string
    externalSubscriptionId: string | null
    provider: string | null
  } | null
): boolean {
  return (
    subscription?.provider === 'abacatepay' &&
    subscription.status === 'active' &&
    subscription.externalSubscriptionId !== null
  )
}
