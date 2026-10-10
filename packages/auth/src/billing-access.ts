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
