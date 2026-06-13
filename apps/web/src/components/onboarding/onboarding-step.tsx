import type { ReactNode } from 'react'

type Accent = 'orange' | 'blue'

const ACCENT_RING: Record<Accent, string> = {
  orange: 'ring-brand-orange/40',
  blue: 'ring-brand-blue/40'
}

type Props = {
  children: ReactNode
  accent: Accent
}

export function OnboardingStep({ children, accent }: Props) {
  return (
    <div
      className={`rounded-3xl bg-white/4 backdrop-blur-md ring-1 ${ACCENT_RING[accent]} p-7 md:p-10 min-h-[420px]`}
    >
      {children}
    </div>
  )
}
