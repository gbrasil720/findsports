import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useMyBar, useMyEvents } from '@/components/admin/admin-queries'
import { getEventTemporalState } from '@/domain/events'
import { getPlan, getPlanLosses, getPlanLossNote } from '@/lib/plan-catalog'
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/subscription-receipt'
import { useTRPC } from '@/utils/trpc'

type Change = { from: SubscriptionPlan; to: SubscriptionPlan }

/**
 * O que o bar deixa de ter na troca (WEB-351): a diferença do catálogo, com os
 * números do próprio bar onde ele tem o recurso. Sem os dados do bar a lista
 * sai só com o catálogo.
 */
function PlanLossList({
  from,
  to,
  onTrial,
  className
}: Change & { onTrial?: boolean; className?: string }) {
  const bar = useMyBar().data
  const events = useMyEvents().data
  const numbers =
    bar && events
      ? {
          ...bar,
          upcomingEvents: events.filter(
            (item) =>
              getEventTemporalState(item.startsAt, item.endsAt) !== 'past'
          ).length
        }
      : null

  return (
    <ul
      className={`mt-3 space-y-2 text-[var(--onside-ink)] text-sm ${className ?? ''}`}
    >
      {getPlanLosses(from, to).map((loss) => {
        const note = numbers
          ? getPlanLossNote(loss.key, numbers, onTrial)
          : null
        return (
          <li key={loss.label}>
            <span className="font-bold">{loss.label}</span>
            {note ? <span className="block">{note}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

type DialogProps = Change & {
  /** Assinatura paga: a diferença vira crédito (WEB-350). */
  earnsCredit: boolean
  /** Teste grátis do cadastro: sem cobrança, o limite conta por mês. */
  onTrial: boolean
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Trocar para um plano menor pede confirmação e diz o que o bar perde, antes
 * de o Stripe mostrar só o preço (WEB-351).
 */
export function DowngradeConfirmDialog({
  from,
  to,
  earnsCredit,
  onTrial,
  confirmLabel,
  onConfirm,
  onCancel
}: DialogProps) {
  // O foco começa em quem não troca nada.
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent
        initialFocus={cancelRef}
        className="onside-dialog flex max-w-[calc(100vw-2rem)] flex-col p-6 sm:max-w-lg"
      >
        <DialogTitle className="onside-display text-2xl">
          Trocar para o {getPlan(to).name}?
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--onside-ink)] text-sm">
          Seu bar sai do {getPlan(from).name} e deixa de ter:
        </DialogDescription>
        {/* Só a lista rola: título, crédito e botões ficam à vista. */}
        <PlanLossList
          from={from}
          to={to}
          onTrial={onTrial}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        />
        {earnsCredit ? (
          <p className="mt-4 text-[var(--onside-ink)] text-sm">
            A diferença vira crédito na sua conta e abate as próximas
            mensalidades (não é reembolsada no cartão).
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="onside-btn onside-btn-ink min-h-12 px-5 text-sm"
          >
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="onside-btn onside-btn-outline min-h-12 px-4 text-xs"
          >
            Manter o {getPlan(from).name}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Quanto esperar o webhook do Stripe gravar a troca depois do retorno. */
const PLAN_CHANGE_MAX_WAIT_MS = 20_000

/**
 * Retorno do portal em `/admin/billing` (WEB-351). `pending` é a troca pedida
 * em `/plan`, e não prova nada: o dono pode ter voltado sem confirmar. O aviso
 * só sai quando a assinatura chega ao plano de destino, e o webhook pode
 * chegar depois do navegador. A busca é limpa em seguida: recarregar não
 * repete o aviso.
 */
export function PlanChangedNotice({ pending }: { pending: Change | null }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const [changed, setChanged] = useState<Change | null>(null)
  const subscription = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false },
    refetchInterval: pending ? RECEIPT_POLL_INTERVAL_MS : false
  }).data
  const from = pending?.from
  const to = pending?.to
  const arrived = to !== undefined && subscription?.currentPlan === to

  useEffect(() => {
    if (!from || !to) return
    const settle = () =>
      navigate({ to: '/admin/billing', search: {}, replace: true })
    if (arrived) {
      setChanged({ from, to })
      settle()
      return
    }
    const timer = setTimeout(settle, PLAN_CHANGE_MAX_WAIT_MS)
    return () => clearTimeout(timer)
  }, [from, to, arrived, navigate])

  if (!changed) return null
  const hasLosses = getPlanLosses(changed.from, changed.to).length > 0

  return (
    <div className="onside-callout onside-callout-acid mb-6" role="status">
      <div>
        <p className="font-semibold text-sm">
          Plano alterado para {getPlan(changed.to).name}.
        </p>
        {hasLosses ? (
          <>
            <p className="mt-1 text-sm">
              Com a troca, seu bar deixa de ter os recursos do{' '}
              {getPlan(changed.from).name}:
            </p>
            <PlanLossList from={changed.from} to={changed.to} />
          </>
        ) : null}
      </div>
    </div>
  )
}
