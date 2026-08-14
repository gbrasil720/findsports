import type { ReactNode } from 'react'

type Variant = 'fan' | 'pub' | 'plan'

const MAX_WIDTHS: Record<Variant, string> = {
  fan: 'max-w-[860px]',
  pub: 'max-w-[860px]',
  plan: 'max-w-6xl'
}

type Props = {
  children: ReactNode
  variant?: Variant
}

export function OnboardingLayout({ children, variant = 'fan' }: Props) {
  return (
    <div className="onside-app relative min-h-dvh overflow-x-clip px-4 py-8 md:px-6 md:py-12">
      <a className="onside-skip-link" href="#onboarding-main">
        Ir para o conteúdo
      </a>
      <div
        id="onboarding-main"
        className={`relative z-10 mx-auto ${MAX_WIDTHS[variant]}`}
      >
        {children}
      </div>
    </div>
  )
}
