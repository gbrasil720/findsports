import type { ReactNode } from 'react'

type Variant = 'fan' | 'pub' | 'plan'

const GRADIENTS: Record<Variant, string> = {
  fan: 'bg-[radial-gradient(circle_at_20%_20%,rgba(255,90,31,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(22,104,255,0.25),transparent_55%)]',
  pub: 'bg-[radial-gradient(circle_at_20%_20%,rgba(255,90,31,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(22,104,255,0.25),transparent_55%)]',
  plan: 'bg-[radial-gradient(circle_at_20%_20%,rgba(22,104,255,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,90,31,0.18),transparent_55%)]'
}

const MAX_WIDTHS: Record<Variant, string> = {
  fan: 'max-w-3xl',
  pub: 'max-w-3xl',
  plan: 'max-w-6xl'
}

type Props = {
  children: ReactNode
  variant?: Variant
}

export function OnboardingLayout({ children, variant = 'fan' }: Props) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-white px-6 py-10 md:py-14 relative overflow-hidden">
      <div className={`absolute inset-0 ${GRADIENTS[variant]}`} />
      <div className={`relative z-10 ${MAX_WIDTHS[variant]} mx-auto`}>
        {children}
      </div>
    </div>
  )
}
