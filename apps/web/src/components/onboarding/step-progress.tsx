type Props = {
  step: number
  steps: readonly string[]
}

export function StepProgress({ step, steps }: Props) {
  return (
    <div className="mb-6">
      <p className="sr-only" aria-live="polite">
        Progresso: passo {step + 1} de {steps.length} — {steps[step]}
      </p>
      <ol className="onside-progress m-0 list-none p-0" aria-hidden="true">
        {steps.map((name, i) => (
          <li
            key={name}
            className={`onside-progress-seg ${
              i < step ? 'is-done' : i === step ? 'is-current' : ''
            }`}
            title={name}
          />
        ))}
      </ol>
      <div className="flex items-center justify-between gap-3 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted-on-ink,#aaa9a4)] uppercase tracking-[0.14em]">
        <span>
          Passo {step + 1} de {steps.length}
        </span>
        <span className="text-[var(--onside-paper)]" aria-current="step">
          {steps[step]}
        </span>
      </div>
    </div>
  )
}
