import { useId } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
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
   * Sobrescreve o rótulo do botão no passo atual. Existe para os passos
   * opcionais: sem nada marcado, "Continuar" esconde que dá para seguir sem
   * preencher, e o dono trava tentando adivinhar o obrigatório. Também dá o
   * nome do que vem a seguir ("Ver a recomendação").
   */
  nextLabel?: string
  /**
   * Por que o botão está desabilitado (WEB-270), ligado a ele por
   * `aria-describedby` — o mesmo desenho do "Para salvar, falta preencher: …"
   * de `components/admin/event-form.tsx`.
   */
  blockedHint?: string | null
}

/**
 * Pé dos dois onboardings no redesign (WEB-501): "Voltar" à esquerda, que não
 * existe nas boas-vindas, e o próximo passo em verde-limão à direita.
 */
export function OnboardingNavigation({
  step,
  totalSteps,
  canAdvance,
  isPending,
  onBack,
  onNext,
  lastLabel = 'Entrar no app',
  nextLabel,
  blockedHint
}: Props) {
  const hintId = useId()
  const label = isPending
    ? 'Salvando…'
    : step === 0
      ? 'Começar'
      : step === totalSteps - 1
        ? lastLabel
        : (nextLabel ?? 'Continuar')

  return (
    <div className="ob-nav">
      {blockedHint ? (
        <p id={hintId} className="ob-nav-hint">
          {blockedHint}
        </p>
      ) : null}
      <div className="ob-nav-row">
        {step > 0 ? (
          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="btn btn-ghost ob-sm"
          >
            <ArrowLeft size={18} color="currentColor" aria-hidden="true" />
            Voltar
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance || isPending}
          aria-describedby={blockedHint ? hintId : undefined}
          className="btn btn-acid"
        >
          {isPending ? (
            <Loader
              size={18}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {label}
        </button>
      </div>
    </div>
  )
}
