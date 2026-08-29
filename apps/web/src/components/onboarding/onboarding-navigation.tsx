import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Loader from 'reicon-react/icons/Loader'

type Props = {
  step: number
  totalSteps: number
  canAdvance: boolean
  isPending: boolean
  onBack: () => void
  onNext: () => void
  lastLabel?: string
  /**
   * Sobrescreve o rótulo do botão no passo atual. Existe para o passo
   * opcional do bar: sem nada marcado, "Continuar" esconde que dá para
   * seguir sem preencher, e o dono trava tentando adivinhar o obrigatório.
   */
  nextLabel?: string
}

export function OnboardingNavigation({
  step,
  totalSteps,
  canAdvance,
  isPending,
  onBack,
  onNext,
  lastLabel = 'Entrar no app',
  nextLabel
}: Props) {
  const getNextLabel = () => {
    if (isPending) return 'Salvando…'
    if (step === 0) return 'Começar'
    if (step === totalSteps - 1) return lastLabel
    return nextLabel ?? 'Continuar'
  }

  return (
    <div className="mt-7 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 0 || isPending}
        className="onside-btn onside-btn-outline min-h-12 px-4"
      >
        <ArrowLeft size={16} color="currentColor" aria-hidden="true" />
        Voltar
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!canAdvance || isPending}
        className="onside-btn onside-btn-acid min-h-12 px-5"
      >
        {isPending ? (
          <Loader
            size={16}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
        ) : null}
        <span className="inline-flex min-w-[8ch] justify-center">
          {getNextLabel()}
        </span>
        {!isPending && (
          <ArrowRight size={16} color="currentColor" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
