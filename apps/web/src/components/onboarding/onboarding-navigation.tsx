import { ArrowLeftBigIcon, ArrowRightBigIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Accent = 'orange' | 'blue'

const ACCENT_BG: Record<Accent, string> = {
  orange: 'bg-brand-orange',
  blue: 'bg-brand-blue'
}

type Props = {
  step: number
  totalSteps: number
  canAdvance: boolean
  isPending: boolean
  onBack: () => void
  onNext: () => void
  accent: Accent
  lastLabel?: string
}

export function OnboardingNavigation({
  step,
  totalSteps,
  canAdvance,
  isPending,
  onBack,
  onNext,
  accent,
  lastLabel = 'Entrar no app'
}: Props) {
  const getNextLabel = () => {
    if (isPending) return 'Salvando...'
    if (step === 0) return 'Começar'
    if (step === totalSteps - 1) return lastLabel
    return 'Continuar'
  }

  return (
    <div className="flex items-center justify-between mt-7">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 0}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
      >
        <HugeiconsIcon
          icon={ArrowLeftBigIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
        />{' '}
        Voltar
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!canAdvance || isPending}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all ${ACCENT_BG[accent]} text-white disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.03]`}
      >
        {getNextLabel()}
        <HugeiconsIcon
          icon={ArrowRightBigIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
        />
      </button>
    </div>
  )
}
