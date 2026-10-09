import {
  formatPlanPrice,
  type Plan,
  type PlanChargeDisplay
} from '@/lib/plan-catalog'

type Props = {
  display: PlanChargeDisplay
  period: Plan['period']
  /** `lg` espelha o destaque do card de planos; `md` cabe no painel de cobrança. */
  size?: 'md' | 'lg'
}

/** Preço mensal exibido com tabela riscada só quando há desconto de verdade. */
export function PlanMonthlyCharge({ display, period, size = 'md' }: Props) {
  const priceClass =
    size === 'lg' ? 'onside-display text-4xl' : 'onside-display text-xl'

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={priceClass}>
          {formatPlanPrice(display.chargeReais)}
        </span>
        <span className="text-sm text-[var(--onside-muted)]">{period}</span>
        {display.listReais != null ? (
          <span className="text-sm text-[var(--onside-muted)] line-through">
            {formatPlanPrice(display.listReais)}
            {period}
          </span>
        ) : null}
      </div>
      {display.hint ? (
        <p className="mt-1 text-xs text-[var(--onside-muted)]">
          {display.hint}
        </p>
      ) : null}
    </div>
  )
}
