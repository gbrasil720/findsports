import { Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

type Plan = {
  id: 'starter' | 'pro' | 'elite'
  name: string
  tagline: string
  price: string
  period: string
  icon: IconSvgElement
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
  return (
    <button
      key={plan.id}
      type="button"
      onClick={() => onSelect(plan.id)}
      className={`relative text-left rounded-3xl p-7 transition-all backdrop-blur-md ring-1 ${
        isSelected
          ? 'bg-white/[0.08] ring-brand-blue scale-[1.02] shadow-[0_0_0_4px_rgba(22,104,255,0.15)]'
          : isCurrent
            ? 'bg-white/[0.05] ring-white/20'
            : 'bg-white/[0.03] ring-white/10 hover:bg-white/[0.06] hover:ring-white/20'
      } ${plan.highlight ? 'md:-translate-y-2' : ''}`}
    >
      {/* Badge "Plano atual" */}
      {isCurrent && (
        <span className="absolute -top-3 left-7 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white">
          Plano atual
        </span>
      )}

      {/* Badge personalizado (ex: Mais escolhido) — só aparece se não for plano atual */}
      {plan.badge && !isCurrent && (
        <span className="absolute -top-3 left-7 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-orange text-white">
          {plan.badge}
        </span>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div
          className={`size-11 rounded-2xl grid place-items-center ${
            isSelected
              ? 'bg-brand-blue text-white'
              : isCurrent
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-white/5 text-white/70'
          }`}
        >
          <HugeiconsIcon
            icon={plan.icon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
          />
        </div>
        <div>
          <div className="font-heading text-xl font-bold leading-none">
            {plan.name}
          </div>
          <div className="text-xs text-white/60 mt-1">{plan.tagline}</div>
        </div>
      </div>

      <div className="mb-6 flex items-baseline gap-1">
        <span className="font-heading text-4xl font-bold">{plan.price}</span>
        <span className="text-sm text-white/50">{plan.period}</span>
      </div>

      <ul className="space-y-2.5">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 text-sm text-white/80"
          >
            <HugeiconsIcon
              icon={Tick01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
              className={`mt-0.5 shrink-0 ${
                isSelected
                  ? 'text-brand-blue'
                  : isCurrent
                    ? 'text-emerald-400'
                    : 'text-white/40'
              }`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div
        className={`mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
          isSelected
            ? 'text-brand-blue'
            : isCurrent
              ? 'text-emerald-400'
              : 'text-white/40'
        }`}
      >
        {isSelected ? (
          <>
            <HugeiconsIcon
              icon={Tick01Icon}
              size={14}
              color="currentColor"
              strokeWidth={1.5}
            />
            Selecionado
          </>
        ) : isCurrent ? (
          <>
            <HugeiconsIcon
              icon={Tick01Icon}
              size={14}
              color="currentColor"
              strokeWidth={1.5}
            />
            Seu plano
          </>
        ) : (
          'Selecionar'
        )}
      </div>
    </button>
  )
}

export type { Plan }
