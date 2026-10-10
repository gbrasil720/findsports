import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import { DowngradeConfirmDialog } from '@/components/billing/plan-change'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { PlanCard } from '@/components/pricing/plan-card'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { startCheckout } from '@/lib/billing-client'
import {
  earnsDowngradeCredit,
  founderCouponFromQuery,
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
import { getCancelNotice } from '@/lib/scheduled-cancel'
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
  // Plano menor confirma antes o que o bar perde (WEB-351), contratando ou só
  // trocando o plano do teste (WEB-358).
  const [confirming, setConfirming] = useState<'checkout' | 'trial' | null>(
    null
  )
  const [testing, setTesting] = useState<Plan['id'] | null>(null)
  const queryClient = useQueryClient()

  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const founderCouponQuery = useQuery(
    trpc.pub.getFounderCouponAvailable.queryOptions()
  )
  const founderCouponAvailable = founderCouponFromQuery(founderCouponQuery)
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.currentPlan ?? null
  const hasActivePlan = currentPlan !== null
  // Quem vê o quê sai do nosso estado da assinatura, numa função só (WEB-249).
  const mode = getPlanPageMode(subscription)
  const regularize = mode === 'regularize'
  const onTrial = mode === 'trial'
  const header = getPlanHeader(subscription)
  const trialNotice = getTrialNotice(subscription)
  const cancelNotice = getCancelNotice(subscription)
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
      if (await startCheckout(selected, currentPlan)) return
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

  // WEB-358: o teste do cadastro troca de plano sem cartão e sem Stripe. Quem
  // decide se pode é o servidor; a data do fim do teste não muda.
  const trialPlan = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      onMutate: () => {
        setError(null)
        setTesting(null)
      },
      // O plano muda o painel inteiro: limite de jogos, perfil, analytics.
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.pub.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.pathKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.commercialAnalytics.pathKey()
          })
        ]),
      onSuccess: ({ plan }) => {
        setPicked(null)
        setTesting(plan)
      },
      onError: () =>
        setError(
          'Não foi possível trocar o plano do teste. Atualize a página e tente novamente.'
        )
    })
  )

  const selection = getPlanSelectionState(currentPlan, selected)
  const selectedName = PLAN_CATALOG.find((p) => p.id === selected)?.name
  const checkoutLabel = `${onTrial ? 'Contratar' : 'Continuar com'} ${selectedName}`
  const trialLabel = `Testar o ${selectedName} grátis`
  const { isDowngrade } = selection
  // No teste grátis o plano vigente ainda não foi contratado: escolher o
  // mesmo plano é contratar, não "plano atual" (WEB-31).
  const isSamePlan = selection.isSamePlan && !onTrial
  // Os jogos do bar já estão carregados quando a confirmação de plano menor
  // abre (WEB-351).
  useQuery({
    ...trpc.pub.getMyEvents.queryOptions(),
    enabled: isDowngrade,
    meta: { errorToast: false }
  })

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
            Você está {onTrial ? 'testando o' : 'no'} plano{' '}
            <span className="font-bold">
              {PLAN_CATALOG.find((p) => p.id === currentPlan)?.name}
            </span>
            . {trialNotice ? `${trialNotice}. ` : null}
            {cancelNotice ? (
              <>
                {cancelNotice}.{' '}
                <ReactivateSubscriptionButton className="font-bold underline underline-offset-2" />
              </>
            ) : onTrial ? (
              'Contratar agora não antecipa a cobrança.'
            ) : (
              'Selecione outro plano abaixo para fazer a troca.'
            )}
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
            // Assinatura no provedor, vigente ou parada: a troca e a
            // regularização não abrem checkout (WEB-353).
            hasSubscription={
              Boolean(subscription?.externalSubscriptionId) &&
              subscription?.standing !== 'ended'
            }
          />
        ))}
      </fieldset>

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

      {testing ? (
        <div
          className="onside-callout onside-callout-acid mx-auto mb-4 max-w-2xl"
          role="status"
        >
          <p className="text-sm font-semibold">
            Agora você está testando o{' '}
            {PLAN_CATALOG.find((p) => p.id === testing)?.name}. A data do fim do
            teste não mudou.
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="flex flex-wrap items-center gap-3">
            {/* Testar é sem cartão e não passa pelo checkout (WEB-358). */}
            {onTrial ? (
              <button
                type="button"
                onClick={() =>
                  isDowngrade
                    ? setConfirming('trial')
                    : trialPlan.mutate({ plan: selected })
                }
                disabled={
                  loading || trialPlan.isPending || selection.isSamePlan
                }
                title={
                  selection.isSamePlan
                    ? 'Você já está testando este plano'
                    : undefined
                }
                className="onside-btn onside-btn-outline min-h-11"
              >
                {trialPlan.isPending
                  ? 'Trocando…'
                  : selection.isSamePlan
                    ? `Testando o ${selectedName}`
                    : trialLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={
                isDowngrade ? () => setConfirming('checkout') : handleCheckout
              }
              disabled={
                loading ||
                trialPlan.isPending ||
                isSamePlan ||
                subscriptionQuery.isLoading
              }
              title={isSamePlan ? 'Este já é seu plano atual' : undefined}
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
                  : checkoutLabel}
              {!isSamePlan && !loading ? (
                <ArrowRight size={16} color="currentColor" aria-hidden="true" />
              ) : null}
            </button>
          </div>
        )}
      </div>

      {confirming && isDowngrade && currentPlan ? (
        <DowngradeConfirmDialog
          from={currentPlan}
          to={selected}
          // WEB-350: só assinatura paga no Stripe gera crédito proporcional;
          // em teste grátis não há o que creditar.
          earnsCredit={earnsDowngradeCredit(subscription)}
          onTrial={onTrial}
          confirmLabel={confirming === 'trial' ? trialLabel : checkoutLabel}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            if (confirming === 'trial') trialPlan.mutate({ plan: selected })
            else handleCheckout()
          }}
        />
      ) : null}
    </OnboardingLayout>
  )
}
