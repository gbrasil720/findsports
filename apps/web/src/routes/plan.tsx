import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { PlanCard } from '@/components/pricing/plan-card'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { startCheckout } from '@/lib/billing-client'
import {
  CHECKOUT_ENABLED_DEFAULT,
  getDefaultPlanSelection,
  getPlanExitLink,
  getPlanHeader,
  getPlanPageMode,
  getPlanSelectionState,
  getTrialNotice,
  PLAN_CATALOG,
  type Plan,
  parsePlanOrigin
} from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { roleAccountLabel } from '@/lib/roles'
import { markCheckoutIntent } from '@/lib/subscription-receipt'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/plan')({
  validateSearch: (search: Record<string, unknown>) => {
    const origin = parsePlanOrigin(search.origin)
    return origin ? { origin } : {}
  },
  head: () => ({
    meta: [
      { title: 'Escolha seu plano — Onside' },
      {
        name: 'description',
        content: 'Escolha o plano ideal para o seu bar no Onside.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: PlanSelection
})

function PlanSelection() {
  const { origin } = Route.useSearch()
  const trpc = useTRPC()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  // ESC-19: a contratação pode estar fechada. Quem decide é o servidor — ver
  // `api/auth/$` — mas descobrir isso só depois do clique, num erro genérico,
  // seria trabalhar contra o dono do bar. Aqui a tela avisa antes.
  //
  // Enquanto carrega, vale o mesmo padrão do servidor: a tela não promete
  // uma contratação que o servidor, sem linha no banco, recusaria.
  const configQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const founderCouponQuery = useQuery(
    trpc.pub.getFounderCouponAvailable.queryOptions()
  )
  const checkoutLiberado =
    configQuery.data?.['billing.checkout_enabled'] ?? CHECKOUT_ENABLED_DEFAULT
  const founderCouponAvailable = founderCouponQuery.data?.available ?? false
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.currentPlan ?? null
  const hasActivePlan = currentPlan !== null
  // Quem vê o quê sai do nosso estado da assinatura, numa função só (WEB-249).
  const mode = getPlanPageMode(subscription)
  const regularize = mode === 'regularize'
  const onTrial = mode === 'trial'
  const header = getPlanHeader(subscription)
  const trialNotice = getTrialNotice(subscription)
  const exitLink = getPlanExitLink(origin)
  // WEB-328: o checkout não pede nome nem empresa; saem do cadastro. A tela
  // diz em nome de quem a assinatura sai antes de mandar para o Stripe.
  const ownerName = useSession()?.user.name
  const barName = useQuery({
    ...trpc.pub.getMe.queryOptions(),
    meta: { errorToast: false }
  }).data?.name
  const subscriptionErrorFeedback = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar sua assinatura. Tente novamente.'
      )
    : null

  // Enquanto o dono não escolhe, vale o plano da assinatura: derivado, e não
  // estado sincronizado por efeito, para a tela nunca abrir num plano que não
  // é o dele (WEB-249).
  const [picked, setPicked] = useState<Plan['id'] | null>(null)
  const selected = picked ?? getDefaultPlanSelection(subscription)

  const handleCheckout = async () => {
    if (!checkoutLiberado) {
      setError(
        'A contratação de planos está temporariamente indisponível. Tente novamente em instantes.'
      )
      return
    }

    analytics.checkoutStarted(selected)
    // WEB-59: marca nossa, não do provedor. É o que permite a `/plan/confirmed`
    // distinguir quem está voltando do checkout — e merece esperar o webhook —
    // de quem abriu a URL do recibo sem ter assinatura.
    markCheckoutIntent(selected)
    setLoading(true)
    setError(null)

    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o Stripe; ver `startCheckout` (WEB-241).
      if (await startCheckout(selected)) return
      setError('Não foi possível iniciar o pagamento. Tente novamente.')
    } catch (checkoutError) {
      // Plano parado (WEB-172): a recusa do servidor já diz o que fazer.
      const refusal = checkoutError as { code?: string; message?: string }
      setError(
        refusal?.code === 'SUBSCRIPTION_PAST_DUE' && refusal.message
          ? refusal.message
          : 'Não foi possível iniciar o pagamento. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  const selection = getPlanSelectionState(currentPlan, selected)
  const { isDowngrade } = selection
  // No teste grátis o plano vigente ainda não foi contratado: escolher o
  // mesmo plano é contratar, não "plano atual" (WEB-31).
  const isSamePlan = selection.isSamePlan && !onTrial

  return (
    <OnboardingLayout variant="plan">
      <OnboardingHeader label={roleAccountLabel('pub')} mb="mb-10" />

      {subscriptionQuery.isLoading ? (
        <div
          className="mx-auto mb-10 max-w-2xl text-center"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Carregando assinatura…</span>
          <Skeleton className="mx-auto mb-3 h-3 w-24" />
          <Skeleton className="mx-auto mb-4 h-12 w-80 max-w-full" />
          <Skeleton className="mx-auto h-6 w-full max-w-xl" />
        </div>
      ) : (
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="onside-kicker mb-3">{header.kicker}</p>
          <h1 className="onside-display mb-4 text-4xl md:text-5xl">
            {header.title}
          </h1>
          <p className="text-[var(--onside-muted)] text-lg">{header.text}</p>
          {regularize ? (
            <Link
              to="/admin/billing"
              className="onside-btn onside-btn-ink mt-6 min-h-11"
            >
              Regularizar assinatura
              <ArrowRight size={16} color="currentColor" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      )}

      {subscriptionQuery.isError ? (
        <div
          className="onside-callout onside-callout-danger mx-auto mb-8 max-w-2xl"
          role="alert"
        >
          <p className="text-sm">{subscriptionErrorFeedback?.message}</p>
          {subscriptionErrorFeedback?.retryable ? (
            <button
              type="button"
              onClick={() => subscriptionQuery.refetch()}
              className="onside-btn onside-btn-outline min-h-11"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {hasActivePlan && currentPlan ? (
        <div className="onside-callout onside-callout-stone mx-auto mb-8 max-w-2xl">
          <CircleInfo
            size={20}
            color="currentColor"
            className="shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm">
            Você está no plano{' '}
            <span className="font-bold">
              {PLAN_CATALOG.find((p) => p.id === currentPlan)?.name}
            </span>
            . {trialNotice ? `${trialNotice}. ` : null}
            {onTrial
              ? 'Contratar agora não antecipa a cobrança.'
              : 'Selecione outro plano abaixo para fazer a troca.'}
          </p>
        </div>
      ) : null}

      <fieldset className="mb-10 grid gap-5 border-0 p-0 md:grid-cols-3">
        <legend className="sr-only">Planos disponíveis</legend>
        {PLAN_CATALOG.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSelected={selected === plan.id}
            isCurrent={
              (regularize ? subscription?.plan : currentPlan) === plan.id
            }
            onSelect={setPicked}
            founderCouponAvailable={founderCouponAvailable}
          />
        ))}
      </fieldset>

      {!checkoutLiberado && !configQuery.isLoading ? (
        <div
          className="onside-callout onside-callout-warn mx-auto mb-4 max-w-2xl"
          role="status"
        >
          <p className="text-sm font-semibold">
            A contratação de planos está temporariamente indisponível.
          </p>
          <p className="text-sm">
            Estamos liberando os pagamentos aos poucos. Sua conta continua ativa
            e você não perde nada esperando.
          </p>
        </div>
      ) : null}

      {isDowngrade ? (
        <div
          className="onside-callout onside-callout-warn mx-auto mb-4 max-w-2xl"
          role="status"
        >
          <p className="text-sm font-semibold">
            Atenção: você está selecionando um plano inferior ao atual.
          </p>
        </div>
      ) : null}

      {!regularize && !subscriptionQuery.isLoading && ownerName && barName ? (
        <div className="onside-callout onside-callout-stone mx-auto mb-4 max-w-2xl">
          <p className="text-sm">
            Assinatura em nome de <span className="font-bold">{ownerName}</span>{' '}
            · <span className="font-bold">{barName}</span>.{' '}
            <Link
              to="/admin"
              hash="admin-espaco"
              className="font-bold underline underline-offset-2"
            >
              Alterar o nome do bar
            </Link>
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="mb-4 text-center text-sm text-[var(--onside-live-text)]"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        aria-busy={configQuery.isLoading || undefined}
      >
        {configQuery.isLoading ? (
          <span className="sr-only">
            Verificando disponibilidade da contratação…
          </span>
        ) : null}
        <Link
          to={exitLink.to}
          className="onside-btn onside-btn-outline min-h-11"
        >
          <ArrowLeft size={16} color="currentColor" aria-hidden="true" />
          {exitLink.label}
        </Link>

        {/* Assinatura paga parada não passa pelo checkout: o topo já leva a
            regularizar (WEB-170). Em trial o botão contrata, e o Stripe só
            cobra no fim do teste (WEB-31). */}
        {regularize ? null : (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              loading ||
              isSamePlan ||
              subscriptionQuery.isLoading ||
              !checkoutLiberado
            }
            title={
              !checkoutLiberado
                ? 'Contratação temporariamente indisponível'
                : isSamePlan
                  ? 'Este já é seu plano atual'
                  : undefined
            }
            className="onside-btn onside-btn-acid min-h-11"
          >
            {loading ? (
              <Loader
                size={16}
                color="currentColor"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {loading
              ? 'Redirecionando…'
              : isSamePlan
                ? 'Plano atual'
                : `${onTrial ? 'Contratar' : 'Continuar com'} ${PLAN_CATALOG.find((p) => p.id === selected)?.name}`}
            {!isSamePlan && !loading ? (
              <ArrowRight size={16} color="currentColor" aria-hidden="true" />
            ) : null}
          </button>
        )}
      </div>
    </OnboardingLayout>
  )
}
