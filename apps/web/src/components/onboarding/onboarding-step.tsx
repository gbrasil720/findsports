import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function OnboardingStep({ children }: Props) {
  return (
    <div className="onside-panel-ink onside-shadow-acid min-h-[420px] p-6 md:p-10">
      {children}
    </div>
  )
}
