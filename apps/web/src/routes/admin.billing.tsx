import { createFileRoute } from '@tanstack/react-router'
import { PlanoPage } from '@/components/painel/plano'
import { parsePlanChange } from '@/lib/plan-catalog'

export const Route = createFileRoute('/admin/billing')({
  // `planFrom`/`planTo`: a troca pedida em `/plan`, de volta do portal (WEB-351).
  validateSearch: parsePlanChange,
  head: () => ({
    meta: [{ title: 'Plano e cobrança — Onside' }]
  }),
  component: BillingPage
})

function BillingPage() {
  const { planFrom, planTo } = Route.useSearch()
  return (
    <PlanoPage
      pending={planFrom && planTo ? { from: planFrom, to: planTo } : null}
    />
  )
}
