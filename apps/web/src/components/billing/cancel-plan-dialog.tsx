import {
  CANCEL_REASONS,
  type CancelReasonId
} from '@findsports_oficial/api/lib/cancel-reasons'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Botao, Card, Chip, propsBotao } from '@/components/painel'
import { startCheckout } from '@/lib/billing-client'
import {
  formatPlanPrice,
  getPlan,
  planChargeFromSubscription
} from '@/lib/plan-catalog'
import { useTRPC } from '@/utils/trpc'
import { PainelModal } from './planos'

/** O plano abaixo, oferecido antes do cancelamento. */
const ABAIXO: Partial<Record<SubscriptionPlan, SubscriptionPlan>> = {
  elite: 'pro',
  pro: 'starter'
}

/** O que o plano de baixo mantém, nas palavras da tabela de `/plan`. */
const MANTEM: Partial<Record<SubscriptionPlan, string>> = {
  pro: 'Mantém destaque por time e liga e analytics completo',
  starter: 'Mantém o bar nas buscas e no mapa'
}

/** Número real que o bar perde; a linha some quando ele não existe. */
export type PerdaCancelamento = { valor: number; rotulo: string }

/**
 * Cancelar com retenção (3q/3r): o que o bar perde, a troca para o plano de
 * baixo e o cancelamento de verdade. Quem cancela é o portal do Stripe, aberto
 * já no fluxo de cancelamento (WEB-339): a URL vem de `pub.openSubscriptionCancel`,
 * e não da rota do plugin, que apaga o registro quando o Stripe recusa. O
 * motivo é opcional e vai junto (WEB-445).
 */
export function CancelPlanDialog({
  plan,
  barName,
  until,
  monthlyDiscountReais,
  perdas,
  onClose
}: {
  plan: SubscriptionPlan
  barName: string
  /** Fim do período pago: até lá o plano segue. */
  until: Date | null
  monthlyDiscountReais: number | null
  perdas: PerdaCancelamento[]
  onClose: () => void
}) {
  const trpc = useTRPC()
  const keep = useRef<HTMLButtonElement>(null)
  const [changing, setChanging] = useState(false)
  const [changeFailed, setChangeFailed] = useState(false)
  const [reason, setReason] = useState<CancelReasonId | null>(null)
  const cancel = useMutation(
    trpc.pub.openSubscriptionCancel.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url
      }
    })
  )
  // Com a URL em mãos o navegador já está saindo: o botão não volta ao normal.
  const opening = cancel.isPending || cancel.isSuccess
  const name = getPlan(plan).name
  const lower = ABAIXO[plan]
  const lowerCharge = lower
    ? planChargeFromSubscription(getPlan(lower), monthlyDiscountReais)
    : null

  const changePlan = async () => {
    if (!lower) return
    setChanging(true)
    setChangeFailed(false)
    try {
      // Assinatura no Stripe: a troca é confirmada no portal, que mostra a
      // diferença (WEB-353). O retorno avisa a troca feita (WEB-351).
      if (await startCheckout(lower, plan)) return
      setChangeFailed(true)
    } catch {
      setChangeFailed(true)
    } finally {
      setChanging(false)
    }
  }

  return (
    <PainelModal
      titulo={
        <>
          Cancelar <br />
          <span className="text-[var(--painel-live)]">o {name}?</span>
        </>
      }
      tamanhoTitulo={44}
      largura={540}
      inicio={keep}
      onClose={onClose}
    >
      <p className="text-[15px] text-[var(--painel-muted)] leading-normal">
        {until
          ? `O plano fica ativo até ${until
              .toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
                timeZone: 'America/Sao_Paulo'
              })
              .replace('.', '')
              .replace(
                ' de ',
                ' '
              )}. Depois disso, o ${barName} sai das buscas e do mapa e perde:`
          : `Depois do cancelamento, o ${barName} sai das buscas e do mapa e perde:`}
      </p>

      {perdas.length > 0 ? (
        <Card kind="live" className="!px-[18px] !py-1">
          {perdas.map((perda, index) => (
            <div
              key={perda.rotulo}
              className={`flex items-center gap-3.5 py-[11px] ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
            >
              <span className="min-w-12 shrink-0 font-[family-name:var(--onside-display)] text-[28px] text-[var(--painel-live)] leading-none">
                {perda.valor.toLocaleString('pt-BR')}
              </span>
              <span className="min-w-0 text-[14.5px]">{perda.rotulo}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {lower && lowerCharge ? (
        <div className="flex items-center gap-3.5 rounded-[7px] bg-[var(--painel-card)] p-4 shadow-[inset_0_0_0_1.5px_var(--painel-fg),4px_4px_0_var(--painel-acid)]">
          <div className="min-w-0 flex-1">
            <b className="text-[15px]">Mudar para o {getPlan(lower).name}</b>
            <p className="mt-0.5 text-[13px] text-[var(--painel-muted)] leading-snug">
              {MANTEM[lower]} por {formatPlanPrice(lowerCharge.chargeReais)}
              /mês.
            </p>
            {changeFailed ? (
              <p
                role="alert"
                className="mt-1 text-[13px] text-[var(--painel-live)]"
              >
                Não foi possível abrir a troca. Tente novamente.
              </p>
            ) : null}
          </div>
          <Botao
            variante="ink"
            altura={40}
            disabled={changing || opening}
            onClick={() => void changePlan()}
          >
            {changing ? 'Abrindo…' : 'Mudar'}
          </Botao>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span id="motivo-cancelamento" className="font-semibold text-[13.5px]">
          Por que está cancelando?
        </span>
        <div
          role="group"
          aria-labelledby="motivo-cancelamento"
          className="flex flex-wrap gap-1.5"
        >
          {CANCEL_REASONS.map((motivo) => (
            <Chip
              key={motivo.id}
              ativo={reason === motivo.id}
              disabled={opening}
              onClick={() => setReason(reason === motivo.id ? null : motivo.id)}
            >
              {motivo.label}
            </Chip>
          ))}
        </div>
      </div>

      {cancel.isError ? (
        <p role="alert" className="text-[13.5px] text-[var(--painel-live)]">
          Não foi possível abrir o cancelamento. Tente de novo em instantes.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <Botao
          variante="danger"
          altura={50}
          className="min-w-[180px] !flex-1"
          disabled={opening || changing}
          onClick={() => cancel.mutate(reason ? { reason } : undefined)}
        >
          {opening ? 'Abrindo portal…' : 'Cancelar mesmo assim'}
        </Botao>
        <button
          ref={keep}
          type="button"
          {...propsBotao(
            { variante: 'acid', altura: 50 },
            'min-w-[180px] !flex-[1.2]'
          )}
          onClick={onClose}
        >
          Manter o {name}
        </button>
      </div>
    </PainelModal>
  )
}
