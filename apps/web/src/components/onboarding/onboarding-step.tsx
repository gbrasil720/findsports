import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  step: number
}

export function OnboardingStep({ children, step }: Props) {
  return (
    <div className="onside-panel-ink onside-shadow-acid min-h-[420px] p-6 md:p-10">
      <div key={step} className="onside-onboarding-step-content">
        {children}
      </div>
    </div>
  )
}
