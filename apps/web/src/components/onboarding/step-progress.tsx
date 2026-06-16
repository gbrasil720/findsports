type Accent = 'orange' | 'blue'

const ACCENT_BAR: Record<Accent, string> = {
  orange: 'bg-brand-orange',
  blue: 'bg-brand-blue'
}

const ACCENT_TEXT: Record<Accent, string> = {
  orange: 'text-brand-orange',
  blue: 'text-brand-blue'
}

type Props = {
  step: number
  steps: readonly string[]
  accent: Accent
}

export function StepProgress({ step, steps, accent }: Props) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        {steps.map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: step index is stable
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? ACCENT_BAR[accent] : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
        <span>
          Passo {step + 1} de {steps.length}
        </span>
        <span className={ACCENT_TEXT[accent]}>{steps[step]}</span>
      </div>
    </div>
  )
}
