import { STARTER_EVENT_LIMIT } from '@findsports_oficial/api/lib/plan-limits'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PlanosFrame } from '@/components/billing/planos'
import planosCss from '@/components/billing/planos.css?url'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import {
  countReceiptLines,
  SubscriptionReceipt
} from '@/components/billing/subscription-receipt'
import { Botao, Card, Icone, IconeBotao, propsBotao } from '@/components/painel'
import painelCss from '@/components/painel/painel.css?url'
import { analytics } from '@/lib/analytics'
import { openBillingPortal } from '@/lib/billing-client'
import { getPlan, isContractedTrial } from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getScheduledCancelAt } from '@/lib/scheduled-cancel'
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
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/plan_/confirmed')({
  head: () => ({
    meta: [
      // Vale para a espera e para o trial: nem sempre há algo confirmado ou pago.
      { title: 'Comprovante de assinatura — Onside' },
      {
        name: 'description',
        content: 'Comprovante da assinatura do seu bar no Onside.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [
      { rel: 'stylesheet', href: painelCss },
      { rel: 'stylesheet', href: planosCss },
      ...PWA_LINKS
    ]
  }),
  component: SubscriptionConfirmed
})

/**
 * Conclusão do checkout (WEB-59).
 *
 * O `successUrl` do checkout do Stripe aponta para cá, e não mais para `/admin`:
 * quem confirma a assinatura é o webhook do Stripe, que pode
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

  // Até saber que não há marca, vale a regra de quem volta do checkout: só a
  // assinatura confirmada pelo provedor imprime recibo. Em ref para a consulta
  // em andamento ler o valor atual.
  const awaitingCheckout = checkoutIntent !== 'absent'
  const awaitingCheckoutRef = useRef(awaitingCheckout)
  awaitingCheckoutRef.current = awaitingCheckout

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
        confirmed: isSubscriptionConfirmed(
          query.state.data ?? null,
          awaitingCheckoutRef.current
        ),
        attempts: attemptsRef.current,
        elapsedMs: Date.now() - startedAtRef.current
      }).shouldPoll
        ? RECEIPT_POLL_INTERVAL_MS
        : false
  })

  const subscription = subscriptionQuery.data ?? null
  const confirmed = isSubscriptionConfirmed(subscription, awaitingCheckout)
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
  const scheduledCancelAt = getScheduledCancelAt(subscription)

  const handleOpenPortal = async () => {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o portal; ver `openBillingPortal`.
      if (await openBillingPortal()) return
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } catch {
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } finally {
      setOpeningPortal(false)
    }
  }

  const card = useQuery({
    ...trpc.pub.getMyBillingBalance.queryOptions(),
    enabled: confirmed && Boolean(subscription?.externalSubscriptionId),
    meta: { errorToast: false },
    retry: false
  }).data?.card
  // PDF do comprovante: a fatura da contratação, a mais nova da assinatura
  // logo depois do checkout (WEB-443). Sem ela, o botão não aparece.
  const receiptPdf = useQuery({
    ...trpc.pub.getMyInvoices.queryOptions(),
    enabled: confirmed && Boolean(subscription?.externalSubscriptionId),
    meta: { errorToast: false },
    retry: false
  }).data?.invoices[0]?.pdfUrl
  const hasPlan = (stage === 'printing' || stage === 'done') && plan !== null
  const barName = barQuery.data?.name ?? null
  const kicker =
    stage === 'done'
      ? subscription?.status === 'active'
        ? 'Pagamento confirmado'
        : 'Assinatura confirmada'
      : stage === 'delayed'
        ? 'Confirmação demorando'
        : 'Confirmando a assinatura'
  const passos =
    hasPlan && plan
      ? [
          {
            icone: 'cal' as const,
            titulo: 'Cadastre os jogos da semana',
            texto:
              plan.id === 'starter'
                ? `Até ${STARTER_EVENT_LIMIT} jogos por ciclo de cobrança.`
                : `${plan.name} não tem limite de jogos.`,
            to: '/admin/jogos' as const
          },
          ...(plan.id === 'elite'
            ? [
                {
                  icone: 'ticket' as const,
                  titulo: 'Revise a oferta da casa',
                  texto: 'É ela que o torcedor ganha ao validar.',
                  to: '/admin/meu-espaco' as const
                },
                {
                  icone: 'code' as const,
                  titulo: 'Teste a validação no balcão',
                  texto: 'Pelo painel ou pelo app.',
                  to: '/admin/validate' as const
                }
              ]
            : [])
        ]
      : []

  return (
    <PlanosFrame>
      <div className="mx-auto grid w-full max-w-[1440px] items-start gap-10 px-4 pt-10 pb-16 lg:grid-cols-[minmax(0,1fr)_420px_minmax(0,1fr)] lg:gap-14 lg:px-[72px] lg:pt-14">
        <div className="flex flex-col gap-3.5 lg:pt-6">
          <span className="font-bold text-[15px] text-[var(--painel-tint)]">
            {kicker}
          </span>
          {hasPlan && plan ? (
            <h1
              className="painel-disp"
              style={{ '--painel-disp-size': '60px' } as React.CSSProperties}
            >
              {plan.name} ativo no
              {barName ? (
                <>
                  <br />
                  <span className="text-[var(--painel-tint)]">{barName}</span>
                </>
              ) : null}
            </h1>
          ) : (
            <h1
              className="painel-disp"
              style={{ '--painel-disp-size': '48px' } as React.CSSProperties}
            >
              {stage === 'delayed'
                ? 'A confirmação está demorando.'
                : 'Confirmando com a operadora.'}
            </h1>
          )}
          <div className="flex max-w-[360px] flex-col gap-2 text-[15px] text-[var(--painel-muted)] leading-normal">
            {stage === 'done' ? (
              <p>Tudo já está ligado.</p>
            ) : stage === 'printing' ? (
              <p>O comprovante sai assim que a Stripe confirmar o pagamento.</p>
            ) : stage === 'delayed' ? (
              <>
                <p>
                  Isso não quer dizer que o pagamento falhou. A operadora ainda
                  não nos avisou, e o plano é liberado assim que o aviso chega —
                  mesmo que você saia desta página.
                </p>
                <p>
                  Para acompanhar, veja Plano e cobrança ou abra o portal da
                  operadora.
                </p>
                {/*
                 * A consulta automática acabou no teto — de propósito, para a
                 * tela não ficar girando para sempre. O botão devolve a
                 * decisão de tentar de novo a quem está esperando.
                 */}
                <Botao
                  className="mt-2 self-start"
                  onClick={() => void subscriptionQuery.refetch()}
                  disabled={subscriptionQuery.isFetching}
                >
                  {subscriptionQuery.isFetching
                    ? 'Verificando…'
                    : 'Verificar de novo'}
                </Botao>
                {portalError ? (
                  <p role="alert" className="text-[var(--painel-live)]">
                    {portalError}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p>
                  Costuma levar alguns segundos. O comprovante sai sozinho
                  quando a confirmação chega.
                </p>
                {subscriptionQuery.isError ? (
                  <p role="alert" className="text-[var(--painel-live)]">
                    Não conseguimos consultar sua assinatura agora.
                    {isRetryableError(subscriptionQuery.error) ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="font-bold underline underline-offset-2"
                          onClick={() => void subscriptionQuery.refetch()}
                        >
                          Tentar novamente
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <SubscriptionReceipt
          stage={stage}
          plan={plan}
          monthlyDiscountReais={subscription?.monthlyDiscountReais ?? null}
          status={subscription?.status ?? ''}
          contractedTrial={isContractedTrial(subscription)}
          currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
          cancelAt={scheduledCancelAt}
          subscriptionRef={subscription?.externalSubscriptionId ?? null}
          barName={barName}
          cardLast4={card?.last4 ?? null}
          issuedAt={issuedAt}
          printDurationMs={printDurationMs}
          feedSteps={plan ? countReceiptLines(plan) : 0}
          onPrinted={() => setPrinted(true)}
          actions={
            stage === 'delayed' ? (
              <>
                <Link
                  to="/admin/billing"
                  {...propsBotao({ variante: 'ink', altura: 50 })}
                >
                  Plano e cobrança
                </Link>
                <Botao
                  altura={50}
                  onClick={handleOpenPortal}
                  disabled={openingPortal}
                >
                  {openingPortal ? 'Abrindo…' : 'Portal da operadora'}
                </Botao>
              </>
            ) : hasPlan ? (
              <>
                {receiptPdf ? (
                  <a
                    href={receiptPdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...propsBotao({ altura: 50 }, '!flex-1 !rounded-[25px]')}
                  >
                    <IconeBotao nome="doc" />
                    Baixar PDF
                  </a>
                ) : null}
                <Link
                  to="/admin"
                  {...propsBotao(
                    { variante: 'acid', altura: 50 },
                    '!flex-[1.3] !rounded-[25px]'
                  )}
                >
                  Ir para o painel
                </Link>
                {scheduledCancelAt ? (
                  <ReactivateSubscriptionButton
                    {...propsBotao({ altura: 50 }, '!rounded-[25px]')}
                  />
                ) : null}
              </>
            ) : (
              <Link to="/admin" {...propsBotao({ altura: 50 })}>
                Ir para o painel
              </Link>
            )
          }
        />

        {passos.length > 0 ? (
          <div className={`lg:pt-6 ${stage === 'done' ? '' : 'opacity-40'}`}>
            <Card className="!px-5 !py-[18px]">
              <h2 className="font-bold text-[15px]">Próximos passos</h2>
              {passos.map((passo) => (
                <Link
                  key={passo.titulo}
                  to={passo.to}
                  className="mt-3 flex items-start gap-3 border-[var(--painel-line)] border-t pt-3"
                >
                  <Icone nome={passo.icone} tamanho={20} />
                  <span>
                    <b className="block text-[14px]">{passo.titulo}</b>
                    <span className="text-[12.5px] text-[var(--painel-muted)]">
                      {passo.texto}
                    </span>
                  </span>
                </Link>
              ))}
            </Card>
          </div>
        ) : null}
      </div>
    </PlanosFrame>
  )
}
