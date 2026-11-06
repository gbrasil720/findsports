import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useRef } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { Logo } from '@/components/landing/v3/icons'
import {
  formatPlanPrice,
  getPlan,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import type { PubOnboardingDraft } from '@/lib/pub-onboarding-draft'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export type PubReceiptData = {
  bar: {
    name: string
    address: string
    neighborhood: string
    city: string
    uf?: string
  }
  plan: SubscriptionPlan
  /** Fim do teste, como o servidor gravou na assinatura. */
  until: string | Date
  founderCoupon: boolean
  issuedAt: Date
}

const BARS = Array.from(
  { length: 38 },
  (_, i) => [1, 2, 1, 3, 1, 2, 2, 1][i % 8]
)

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

const reais = (value: number) => `${formatPlanPrice(value)},00`

/**
 * Comprovante do cadastro do bar (WEB-501; `recibo()` do protótipo do painel):
 * a impressora térmica solta o papel linha a linha, com os dados reais do bar
 * e do teste. Não é documento fiscal, e nada é cobrado hoje.
 */
export function PubReceipt({
  data,
  continueLabel,
  pending,
  onContinue
}: {
  data: PubReceiptData
  continueLabel: string
  pending: boolean
  onContinue: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  const plan = getPlan(data.plan)
  const charge = planChargeForShowcase(plan, data.founderCoupon)
  const { bar } = data
  const lines: [string, ReactNode][] = []
  const row = (cls: string, left: ReactNode, right?: ReactNode) =>
    lines.push([
      cls,
      <>
        <span>{left}</span>
        {right === undefined ? null : <span>{right}</span>}
      </>
    ])
  const cut = () => lines.push(['rl-cut', null])

  lines.push([
    'rl-logo',
    <>
      <Logo size={30} />
      <b>ONSIDE</b>
    </>
  ])
  row('rl-c', 'COMPROVANTE DE CADASTRO')
  row(
    'rl-m',
    date(data.issuedAt),
    data.issuedAt.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  )
  cut()
  row('rl-b', bar.name.toUpperCase())
  row('rl-m', bar.address)
  row('rl-m', `${bar.neighborhood} · ${bar.city}${bar.uf ? `/${bar.uf}` : ''}`)
  cut()
  row('rl-b', `PLANO ${plan.name.toUpperCase()} · TESTE`, 'R$ 0,00')
  row('rl-m', `${ONBOARDING_TRIAL.days} dias`, `até ${date(data.until)}`)
  row('rl-m', 'Cartão', 'não pedido')
  cut()
  row('rl-b', 'DEPOIS DO TESTE')
  row(
    '',
    charge.listReais ? `${plan.name} · fundador` : plan.name,
    `${reais(charge.chargeReais)}/mês`
  )
  if (charge.listReais)
    row('rl-m rl-s', 'Tabela', `${reais(charge.listReais)}/mês`)
  lines.push([
    'rl-note',
    'Só é cobrado se você contratar. Sem contratar, nada é cobrado e o bar sai do ar quando o teste acaba.'
  ])
  cut()
  row('rl-tot', 'TOTAL HOJE', 'R$ 0,00')
  lines.push([
    'rl-bars',
    BARS.map((width, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: código de barras decorativo, fixo.
      <i key={i} style={{ width }} />
    ))
  ])
  row('rl-c rl-m', 'obrigado por torcer com a gente')

  return (
    <div className="ob-rcpt">
      <span className="ob-k">Pronto. Saiu o seu comprovante</span>
      <h1 ref={headingRef} className="ob-h" tabIndex={-1}>
        {bar.name} entrou na Onside
      </h1>
      <div className="ob-printer" aria-hidden="true">
        <span className="slot" />
        <span className="ob-led" />
      </div>
      <div
        className="ob-paper"
        role="document"
        aria-label="Comprovante de cadastro"
      >
        {lines.map(([cls, content], i) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: as linhas são fixas e saem na ordem do papel.
            key={i}
            className={`rl ${cls}`}
            style={{ animationDelay: `${i * 95}ms` }}
            aria-hidden={
              cls === 'rl-bars' || cls === 'rl-cut' ? true : undefined
            }
          >
            {content}
          </p>
        ))}
      </div>
      <div className="ob-cta">
        <button
          type="button"
          className="btn btn-acid"
          onClick={onContinue}
          disabled={pending}
        >
          {pending ? (
            <Loader
              size={18}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {continueLabel}
        </button>
      </div>
      <p className="ob-note">
        O plano e o fim do teste ficam também em Assinatura e pagamentos, no
        painel do bar.
      </p>
    </div>
  )
}

/**
 * Depois do `completePub`: o bar nasce no teste do Elite, então o plano
 * escolhido no cadastro entra por `pub.changeTrialPlan` (no Elite, nada a
 * fazer). O comprovante sai do que o servidor gravou, não do rascunho: se a
 * troca falhar, ele mostra o Elite, que é o plano de verdade.
 */
export function useFinishPubSignup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { mutateAsync: changeTrialPlan } = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({ meta: { errorToast: false } })
  )
  // Estável: entra nas dependências do `continueVerified` de `/verify-email`,
  // que roda num efeito.
  return useCallback(
    async (draft: PubOnboardingDraft): Promise<PubReceiptData | null> => {
      if (draft.plan && draft.plan !== 'elite') {
        try {
          await changeTrialPlan({ plan: draft.plan })
        } catch (error) {
          toast.error(
            getUserFacingMessage(
              error,
              'Não deu para trocar o plano do teste agora. Você troca depois, em Plano.'
            )
          )
        }
      }
      try {
        const [subscription, coupon] = await Promise.all([
          queryClient.fetchQuery(trpc.pub.getMySubscription.queryOptions()),
          queryClient
            .fetchQuery(trpc.pub.getFounderCouponAvailable.queryOptions())
            .catch(() => ({ available: false }))
        ])
        if (!subscription?.currentPeriodEnd) return null
        return {
          bar: {
            name: draft.name,
            address: draft.address,
            neighborhood: draft.neighborhood,
            city: draft.city ?? 'São Paulo',
            uf: draft.uf
          },
          plan: subscription.plan,
          until: subscription.currentPeriodEnd,
          founderCoupon: coupon.available,
          issuedAt: new Date()
        }
      } catch {
        // Sem a assinatura não há comprovante de verdade: segue sem ele.
        return null
      }
    },
    [changeTrialPlan, queryClient, trpc]
  )
}
