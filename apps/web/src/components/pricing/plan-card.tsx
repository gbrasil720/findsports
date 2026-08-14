import type { ComponentType, SVGAttributes } from 'react'
import Check from 'reicon-react/icons/Check'

type IconProps = SVGAttributes<SVGSVGElement> & {
  size?: number | string
  color?: string
}

type Plan = {
  id: 'starter' | 'pro' | 'elite'
  name: string
  tagline: string
  price: string
  period: string
  icon: ComponentType<IconProps>
  features: string[]
  highlight?: boolean
  badge?: string
}

type Props = {
  plan: Plan
  isSelected: boolean
  isCurrent?: boolean
  onSelect: (id: Plan['id']) => void
}

export function PlanCard({ plan, isSelected, isCurrent, onSelect }: Props) {
  const Icon = plan.icon

  return (
    <label
      className={`relative block min-h-11 w-full cursor-pointer border-[1.5px] border-[var(--onside-ink)] p-6 text-left transition-[transform,box-shadow,background] duration-150 focus-within:ring-[3px] focus-within:ring-[var(--onside-live)] ${
        isSelected
          ? 'bg-[var(--onside-acid)] shadow-[6px_6px_0_var(--onside-ink)]'
          : 'bg-[var(--onside-paper)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0_var(--onside-ink)]'
      } ${plan.highlight && !isSelected ? 'ring-2 ring-[var(--onside-ink)]' : ''}`}
    >
      <input
        type="radio"
        name="onside-plan"
        value={plan.id}
        checked={isSelected}
        onChange={() => onSelect(plan.id)}
        className="sr-only"
        aria-label={`${plan.name}, ${plan.price}${plan.period}. ${plan.tagline}`}
      />
      {isCurrent ? (
        <span className="onside-badge onside-badge-ink absolute -top-3 left-5">
          Plano atual
        </span>
      ) : null}

      {plan.badge && !isCurrent ? (
        <span className="onside-badge onside-badge-acid absolute -top-3 left-5">
          {plan.badge}
        </span>
      ) : null}

      <div className="mb-5 flex items-center gap-3">
        <div
          className={`grid size-11 place-items-center border border-[var(--onside-ink)] ${
            isSelected
              ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
              : 'bg-[var(--onside-stone)] text-[var(--onside-ink)]'
          }`}
        >
          <Icon size={20} color="currentColor" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="onside-display text-2xl leading-none">
            {plan.name}
          </div>
          <div className="mt-1 text-xs text-[var(--onside-muted)]">
            {plan.tagline}
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-baseline gap-1">
        <span className="onside-display text-4xl">{plan.price}</span>
        <span className="text-sm text-[var(--onside-muted)]">
          {plan.period}
        </span>
      </div>

      <ul className="space-y-2.5">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 text-sm text-[var(--onside-ink)]"
          >
            <Check
              size={16}
              color="currentColor"
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--onside-ink)]">
        {isSelected ? 'Selecionado' : isCurrent ? 'Seu plano' : 'Selecionar'}
      </div>
    </label>
  )
}

export type { Plan }
