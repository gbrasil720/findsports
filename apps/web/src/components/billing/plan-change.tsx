import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useMyBar, useMyEvents } from '@/components/admin/admin-queries'
import { Botao, Card, Medalha, propsBotao } from '@/components/painel'
import { getEventTemporalState } from '@/domain/events'
import { ehRascunho } from '@/domain/painel-jogos'
import { getPlan, getPlanLosses, getPlanLossNote } from '@/lib/plan-catalog'
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/subscription-receipt'
import { useTRPC } from '@/utils/trpc'
import { PainelModal } from './planos'

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
  // Rascunho (WEB-436) não está nas buscas: não se perde.
  const upcoming = events?.filter(
    (item) =>
      !ehRascunho(item) &&
      getEventTemporalState(item.startsAt, item.endsAt) !== 'past'
  )
  const numbers =
    bar && upcoming ? { ...bar, upcomingEvents: upcoming.length } : null

  return (
    <ul className={`mt-3 space-y-2 text-sm ${className ?? ''}`}>
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
    <PainelModal
      titulo={`Trocar para o ${getPlan(to).name}?`}
      icone={<Medalha plano={to} tamanho={52} />}
      inicio={cancelRef}
      onClose={onCancel}
    >
      <div>
        <p className="text-[15px] text-[var(--painel-muted)]">
          Seu bar sai do {getPlan(from).name} e deixa de ter:
        </p>
        <PlanLossList from={from} to={to} onTrial={onTrial} />
      </div>
      {earnsCredit ? (
        <p className="text-sm">
          A diferença vira crédito na sua conta e abate as próximas mensalidades
          (não é reembolsada no cartão).
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Botao
          variante="ink"
          altura={48}
          className="!flex-1"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Botao>
        <button
          ref={cancelRef}
          type="button"
          {...propsBotao({ variante: 'acid', altura: 48 }, '!flex-1')}
          onClick={onCancel}
        >
          Manter o {getPlan(from).name}
        </button>
      </div>
    </PainelModal>
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
    <Card kind="acid" role="status">
      <div>
        <p className="font-bold text-[15px]">
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
    </Card>
  )
}
