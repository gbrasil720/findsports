import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Check from 'reicon-react/icons/Check'
import Loader from 'reicon-react/icons/Loader'

type Status =
  inferRouterOutputs<AppRouter>['recommendations']['getMyBarQualityStatus']

type Props = {
  status: Status | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
}

export function RecommendationQualityStatus(props: Props) {
  if (props.loading) {
    return (
      <div
        className="onside-callout"
        role="status"
        aria-label="Carregando status das sugestões"
      >
        <Loader size={18} color="currentColor" className="animate-spin" />
        <p className="text-sm">Verificando elegibilidade nas sugestões…</p>
      </div>
    )
  }

  if (props.error || !props.status) {
    return (
      <div className="onside-callout onside-callout-warn" role="alert">
        <AlertCircle size={18} color="currentColor" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            Não foi possível verificar as sugestões personalizadas.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onRetry}
          className="onside-btn onside-btn-ink min-h-11 px-4 text-xs"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!props.status.commerciallyEligible) return null

  if (props.status.protectedByQuality) {
    return (
      <div className="onside-callout onside-callout-warn">
        <AlertCircle size={20} color="currentColor" aria-hidden="true" />
        <div>
          <p className="font-semibold text-sm">
            Seu bar está temporariamente fora das sugestões personalizadas
          </p>
          <p className="mt-1 text-sm opacity-90">
            Nos últimos {props.status.windowDays} dias,{' '}
            {props.status.recentPositivePercentage}% de{' '}
            {props.status.recentRatingCount} avaliações responderam “voltaria”.
            A elegibilidade retorna automaticamente ao atingir{' '}
            {props.status.minimumPositivePercentage}% ou quando a amostra
            recente mudar. Seu perfil e sua presença na busca continuam ativos.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="onside-callout onside-callout-acid">
      <Check size={20} color="currentColor" aria-hidden="true" />
      <div>
        <p className="font-semibold text-sm">
          Elegível para sugestões personalizadas
        </p>
        <p className="mt-1 text-sm opacity-90">
          O nível do seu plano não interfere na afinidade ou na posição.
        </p>
      </div>
    </div>
  )
}
