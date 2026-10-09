import { formatPlanPrice, type Plan } from '@/lib/plan-catalog'

type Props = {
  plan: Pick<Plan, 'tablePrice' | 'founderPrice' | 'period'>
  /** `lg` espelha o destaque do card de planos; `md` cabe no painel de cobrança. */
  size?: 'md' | 'lg'
}

/**
 * Preço que o bar paga no checkout com cupom de fundador, com a tabela cheia
 * (preço de lista no Stripe) riscada — alinhado ao card em `/plan`.
 */
export function PlanMonthlyCharge({ plan, size = 'md' }: Props) {
  const priceClass =
    size === 'lg' ? 'onside-display text-4xl' : 'onside-display text-xl'

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={priceClass}>{formatPlanPrice(plan.founderPrice)}</span>
        <span className="text-sm text-[var(--onside-muted)]">
          {plan.period}
        </span>
        <span className="text-sm text-[var(--onside-muted)] line-through">
          {formatPlanPrice(plan.tablePrice)}
          {plan.period}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--onside-muted)]">
        Com desconto de fundador no checkout
      </p>
    </div>
  )
}
