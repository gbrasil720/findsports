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
