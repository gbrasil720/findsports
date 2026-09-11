import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import ExternalLink from 'reicon-react/icons/ArrowUpRight'
import {
  countReceiptLines,
  SubscriptionReceipt
} from '@/components/billing/subscription-receipt'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { analytics } from '@/lib/analytics'
import { getCustomerPortalUrl } from '@/lib/dodo-customer-client'
import { getPlan } from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { roleAccountLabel } from '@/lib/roles'
import {
  clearCheckoutIntent,
  isSubscriptionConfirmed,
  prefersReducedMotion,
  RECEIPT_POLL_INTERVAL_MS,
  readCheckoutIntent,
  receiptPrintDurationMs,
  resolveReceiptStage,
  resolveReceiptWait,
  shouldLeaveReceipt
} from '@/lib/subscription-receipt'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/plan_/confirmed')({
  head: () => ({
    meta: [
      { title: 'Assinatura confirmada — Onside' },
      {
        name: 'description',
        content: 'Comprovante da assinatura do seu bar no Onside.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: SubscriptionConfirmed
})

/**
 * Conclusão do checkout (WEB-59).
 *
 * O `successUrl` do plugin do Dodo aponta para cá, e não mais para `/admin`:
 * quem confirma a assinatura é o webhook `onSubscriptionActive`, que pode
 * chegar depois do redirect. Esta tela é o lugar onde essa corrida acontece à
 * vista — o recibo fica imprimindo enquanto a confirmação não chega.
 *
 * Nada da query string do provedor é lido. A autoridade é `pub.getMySubscription`,
 * que devolve o que está gravado no nosso banco.
 */
function SubscriptionConfirmed() {
  const trpc = useTRPC()
  const navigate = useNavigate()

  const startedAtRef = useRef(Date.now())
  const attemptsRef = useRef(0)
  const [exhausted, setExhausted] = useState(false)
  const [printed, setPrinted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [issuedAt] = useState(() => new Date())
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  /**
   * `unknown` até o cliente montar: `localStorage` não existe no SSR, e chutar
   * um dos lados aqui trocaria o HTML servido pelo do cliente na hidratação.
   */
  const [checkoutIntent, setCheckoutIntent] = useState<
    'unknown' | 'present' | 'absent'
  >('unknown')

  useEffect(() => {
    setCheckoutIntent(readCheckoutIntent() ? 'present' : 'absent')
    setReducedMotion(prefersReducedMotion())
  }, [])

  const subscriptionOptions = trpc.pub.getMySubscription.queryOptions()
  const fetchSubscription = subscriptionOptions.queryFn

  const subscriptionQuery = useQuery({
    ...subscriptionOptions,
    /*
     * A contagem de tentativas mora aqui, na consulta em si: é o único ponto
     * que sabe quantas idas ao servidor realmente aconteceram — uma resposta
     * que demora não vira duas tentativas, e uma que falha continua contando.
     */
    queryFn:
      typeof fetchSubscription === 'function'
        ? (context) => {
            attemptsRef.current += 1
            return fetchSubscription(context)
          }
        : fetchSubscription,
    // O erro é desenhado na própria tela, com botão de tentar de novo. O toast
    // global repetiria a falha durante uma espera que já é tensa.
    meta: { errorToast: false },
    refetchInterval: (query) =>
      resolveReceiptWait({
        confirmed: isSubscriptionConfirmed(query.state.data ?? null),
        attempts: attemptsRef.current,
        elapsedMs: Date.now() - startedAtRef.current
      }).shouldPoll
        ? RECEIPT_POLL_INTERVAL_MS
        : false
  })

  const subscription = subscriptionQuery.data ?? null
  const confirmed = isSubscriptionConfirmed(subscription)
  const plan = subscription?.currentPlan
    ? getPlan(subscription.currentPlan)
    : null

  // O nome do bar é do recibo, não da espera: só é buscado quando há recibo.
  const barQuery = useQuery({
    ...trpc.pub.getMe.queryOptions(),
    enabled: confirmed,
    meta: { errorToast: false }
  })

  /*
   * O teto vive num relógio próprio porque o de tentativas sozinho não fecha
   * a espera quando as consultas ficam penduradas na rede.
   */
  useEffect(() => {
    if (confirmed || exhausted) return
    const timer = setInterval(() => {
      const wait = resolveReceiptWait({
        confirmed: false,
        attempts: attemptsRef.current,
        elapsedMs: Date.now() - startedAtRef.current
      })
      if (wait.exhausted) setExhausted(true)
    }, RECEIPT_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [confirmed, exhausted])

  const printDurationMs =
    reducedMotion || !plan ? 0 : receiptPrintDurationMs(countReceiptLines(plan))

  /*
   * Quem encerra a impressão é o fim da animação da folha, que o componente
   * avisa. Este relógio é só a rede de segurança para quando animação nenhuma
   * roda — aba em segundo plano, movimento reduzido, navegador que engoliu o
   * evento —, e por isso espera uma folga além da duração nominal.
   */
  useEffect(() => {
    if (!confirmed || printed) return
    if (printDurationMs <= 0) {
      setPrinted(true)
      return
    }
    const timer = setTimeout(() => setPrinted(true), printDurationMs + 1500)
    return () => clearTimeout(timer)
  }, [confirmed, printed, printDurationMs])

  useEffect(() => {
    if (!confirmed || !subscription?.currentPlan) return
    clearCheckoutIntent()
    analytics.subscriptionConfirmed(subscription.currentPlan)
  }, [confirmed, subscription?.currentPlan])

  useEffect(() => {
    if (!exhausted || confirmed) return
    analytics.subscriptionConfirmationDelayed(
      Math.round((Date.now() - startedAtRef.current) / 1000)
    )
  }, [exhausted, confirmed])

  /*
   * Recibo de nada não existe: sem assinatura confirmada e sem ter passado
   * pelo nosso checkout, o caminho é escolher um plano. A saída espera a
   * primeira resposta — bouncing antes dela devolveria para `/plan` quem tem
   * assinatura ativa.
   */
  useEffect(() => {
    if (checkoutIntent !== 'absent') return
    if (!subscriptionQuery.isSuccess) return
    if (!shouldLeaveReceipt({ confirmed, hasCheckoutIntent: false })) return
    void navigate({ to: '/plan', replace: true })
  }, [checkoutIntent, subscriptionQuery.isSuccess, confirmed, navigate])

  const stage = resolveReceiptStage({ confirmed, exhausted, printed })

  const handleOpenPortal = async () => {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      const portalUrl = await getCustomerPortalUrl()
      if (portalUrl) {
        window.location.href = portalUrl
        return
      }
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } catch {
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <OnboardingLayout variant="pub">
      <OnboardingHeader label={roleAccountLabel('pub')} mb="mb-8" />

      <SubscriptionReceipt
        stage={stage}
        plan={plan}
        status={subscription?.status ?? ''}
        currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
        subscriptionRef={subscription?.dodoSubscriptionId ?? null}
        barName={barQuery.data?.name ?? null}
        issuedAt={issuedAt}
        printDurationMs={printDurationMs}
        feedSteps={plan ? countReceiptLines(plan) : 0}
        onPrinted={() => setPrinted(true)}
        waitingSlot={
          stage === 'delayed' ? (
            <>
              <h2>A confirmação está demorando.</h2>
              <p>
                Isso não quer dizer que o pagamento falhou. A operadora ainda
                não nos avisou, e o plano é liberado assim que o aviso chega —
                mesmo que você saia desta página.
              </p>
              <p>
                Para acompanhar, veja assinatura e pagamentos ou abra o portal
                da operadora.
              </p>
              {/*
               * A consulta automática acabou no teto — de propósito, para a
               * tela não ficar girando para sempre. O botão devolve a decisão
               * de tentar de novo a quem está esperando.
               */}
              <p>
                <button
                  type="button"
                  className="onside-receipt-retry"
                  onClick={() => void subscriptionQuery.refetch()}
                  disabled={subscriptionQuery.isFetching}
                >
                  {subscriptionQuery.isFetching
                    ? 'Verificando…'
                    : 'Verificar de novo'}
                </button>
              </p>
              {portalError ? (
                <p role="alert" className="onside-receipt-error">
                  {portalError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h2>Confirmando com a operadora.</h2>
              <p>
                Costuma levar alguns segundos. O recibo é impresso sozinho
                quando a confirmação chega.
              </p>
              {subscriptionQuery.isError ? (
                <p role="alert" className="onside-receipt-error">
                  Não conseguimos consultar sua assinatura agora.{' '}
                  <button
                    type="button"
                    className="onside-receipt-retry"
                    onClick={() => void subscriptionQuery.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              ) : null}
            </>
          )
        }
        actions={
          stage === 'processing' ? (
            <Link
              to="/admin"
              className="onside-btn onside-btn-outline min-h-11"
            >
              Ir para o painel
              <ArrowRight size={16} color="currentColor" aria-hidden="true" />
            </Link>
          ) : stage === 'delayed' ? (
            <>
              <Link
                to="/admin/billing"
                className="onside-btn onside-btn-ink min-h-11"
              >
                Assinatura e pagamentos
                <ArrowRight size={16} color="currentColor" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="onside-btn onside-btn-outline min-h-11"
              >
                {openingPortal ? 'Abrindo…' : 'Portal da operadora'}
                <ExternalLink
                  size={16}
                  color="currentColor"
                  aria-hidden="true"
                />
              </button>
              <Link
                to="/admin"
                className="onside-btn onside-btn-ghost min-h-11"
              >
                Ir para o painel
              </Link>
            </>
          ) : (
            <>
              <Link to="/admin" className="onside-btn onside-btn-acid min-h-11">
                Ir para o painel
                <ArrowRight size={16} color="currentColor" aria-hidden="true" />
              </Link>
              <Link
                to="/admin/billing"
                className="onside-btn onside-btn-outline min-h-11"
              >
                Assinatura e pagamentos
              </Link>
            </>
          )
        }
      />
    </OnboardingLayout>
  )
}
