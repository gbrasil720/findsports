type BillingUser = {
  role?: string | null
  emailVerified?: boolean | null
}

export function requiresPubBillingAccess(path: string): boolean {
  return (
    path === '/dodopayments/checkout' ||
    path === '/dodopayments/checkout-session' ||
    path.startsWith('/dodopayments/customer/')
  )
}

export function canAccessPubBilling(user: BillingUser | null): boolean {
  return user?.role === 'pub' && user.emailVerified === true
}
