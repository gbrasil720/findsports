import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import type { ReactNode } from 'react'
import { useRef } from 'react'

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
  // Diálogo e popover montam na raiz de `.onside-app`, como no ProductFrame:
  // fora dela ficam sem o estilo do app. Não no miolo, porque ele é animado
  // com `transform` e prenderia o `position: fixed`.
  const portalContainer = useRef<HTMLDivElement>(null)

  return (
    <PortalProvider container={portalContainer}>
      <div
        ref={portalContainer}
        className="onside-app relative min-h-dvh overflow-x-clip px-4 py-8 md:px-6 md:py-12"
      >
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
    </PortalProvider>
  )
}
