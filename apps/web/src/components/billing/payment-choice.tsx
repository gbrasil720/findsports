import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useRef, useState } from 'react'
import { formatPlanPrice, getPlan } from '@/lib/plan-catalog'

export type PaymentMethod = 'card' | 'pix'
/** Pix no teste do cadastro: no fim dele (padrão) ou já, encerrando o teste. */
export type PixTiming = 'trial_end' | 'now'

const ddmm = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  })

/**
 * "Como você quer pagar?" antes de contratar: cartão (Stripe) ou Pix
 * Automático (AbacatePay). No teste do cadastro o Pix também espera o fim
 * dele (dono, 11/11/2026): a AbacatePay não agenda débito, então a escolha
 * fica gravada e a autorização é pedida perto do fim. Quem quiser autoriza
 * já, e o teste acaba aí. Fora do teste, o Pix debita na autorização, e a
 * janela diz isso com todas as letras.
 */
export function PaymentChoiceDialog({
  plan,
  chargeReais,
  listReais,
  trialEnd,
  pixPlanChange,
  pending,
  error,
  onConfirm,
  onCancel
}: {
  plan: SubscriptionPlan
  chargeReais: number | null
  listReais: number | null
  /** Fim do teste grátis do cadastro, quando ele está correndo. */
  trialEnd: string | Date | null
  /** Bar que já paga por Pix trocando de plano: só o Pix, com a troca explicada. */
  pixPlanChange: SubscriptionPlan | null
  pending: PaymentMethod | null
  error: string | null
  onConfirm: (method: PaymentMethod, timing?: PixTiming) => void
  onCancel: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>(
    pixPlanChange ? 'pix' : 'card'
  )
  const backRef = useRef<HTMLButtonElement>(null)
  const name = getPlan(plan).name
  const price = chargeReais === null ? null : formatPlanPrice(chargeReais)
  const busy = pending !== null
  // Pix que espera o fim do teste: só no teste do cadastro, e não na troca
  // de plano de quem já paga por Pix.
  const pixWaits = trialEnd !== null && pixPlanChange === null

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel()
      }}
    >
      <DialogContent
        initialFocus={backRef}
        className="pl-dlg pl-pay flex max-h-[min(92dvh,900px)] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[26px] p-[26px] sm:max-w-[580px]"
      >
        <p className="pl-dlg-k">
          {pixPlanChange ? `Mudar para o ${name}` : `Contratar o ${name}`}
        </p>
        <DialogTitle className="pl-dlg-h">Como você quer pagar?</DialogTitle>
        <DialogDescription className="sr-only">
          Escolha entre cartão de crédito e Pix Automático.
        </DialogDescription>

        {price ? (
          <div className="pl-pay-price">
            {listReais !== null ? <s>{formatPlanPrice(listReais)}</s> : null}
            <b>{price}</b>
            <span>por mês, no cartão ou no Pix</span>
            {listReais !== null ? (
              <span className="pl-pay-fund">PREÇO DE FUNDADOR</span>
            ) : null}
          </div>
        ) : null}

        <div
          className="pl-pay-opts"
          role="radiogroup"
          aria-label="Forma de pagamento"
        >
          {pixPlanChange ? null : (
            // biome-ignore lint/a11y/useSemanticElements: cartão de escolha inteiro clicável, como o plano do cadastro.
            <button
              type="button"
              role="radio"
              aria-checked={method === 'card'}
              className="pl-pay-opt"
              disabled={busy}
              onClick={() => setMethod('card')}
            >
              <span className="pl-pay-ic" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24">
                  <rect
                    x="2.5"
                    y="5"
                    width="19"
                    height="14"
                    rx="2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M2.5 10h19M6.5 15h4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="pl-pay-tx">
                <b>
                  Cartão de crédito
                  {trialEnd ? (
                    <span className="pl-pay-tag">
                      TESTE GRÁTIS ATÉ {ddmm(trialEnd)}
                    </span>
                  ) : null}
                </b>
                <span>
                  {trialEnd
                    ? `A primeira cobrança só sai em ${ddmm(trialEnd)}, quando o teste acaba. Depois, todo mês no cartão.`
                    : 'Cobrado todo mês no cartão, pelo Stripe.'}
                </span>
              </span>
              <span className="pl-pay-dot" aria-hidden="true" />
            </button>
          )}

          {/* biome-ignore lint/a11y/useSemanticElements: cartão de escolha inteiro clicável, como o plano do cadastro. */}
          <button
            type="button"
            role="radio"
            aria-checked={method === 'pix'}
            className="pl-pay-opt"
            disabled={busy}
            onClick={() => setMethod('pix')}
          >
            <span className="pl-pay-ic is-pix" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path
                  d="M12 3.5l3.6 3.6-3.6 3.6-3.6-3.6zM12 13.3l3.6 3.6-3.6 3.6-3.6-3.6zM3.5 12l3.6-3.6 3.6 3.6-3.6 3.6zM13.3 12l3.6-3.6 3.6 3.6-3.6 3.6z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="pl-pay-tx">
              <b>
                Pix Automático
                {pixWaits ? (
                  <span className="pl-pay-tag">
                    TESTE GRÁTIS ATÉ {ddmm(trialEnd)}
                  </span>
                ) : (
                  <span className="pl-pay-tag is-no">SEM TESTE GRÁTIS</span>
                )}
              </b>
              <span>
                {pixWaits
                  ? `Perto de ${ddmm(trialEnd)}, a gente te avisa para autorizar no app do banco. Depois, o débito sai todo mês.`
                  : 'Você autoriza uma vez no app do banco e o débito sai todo mês. Sem cartão e sem QR Code a cada mês.'}
              </span>
            </span>
            <span className="pl-pay-dot" aria-hidden="true" />
          </button>
        </div>

        {method === 'pix' && pixWaits ? (
          <div className="pl-pay-info" role="note">
            <b>Seu teste segue até {ddmm(trialEnd)}.</b> Nada é cobrado agora.
            Três dias antes e no último dia, a gente avisa por e-mail e no
            painel para você autorizar o Pix. O primeiro débito
            {price ? ` de ${price}` : ''} sai quando você autorizar. Sem a
            autorização, o bar sai do ar quando o teste acabar.
          </div>
        ) : method === 'pix' ? (
          <div className="pl-pay-warn" role="note">
            <b>O Pix não tem teste grátis.</b>{' '}
            {pixPlanChange
              ? `Mudar de plano no Pix pede uma nova autorização: o primeiro débito do ${name}${price ? `, de ${price},` : ''} sai hoje, e o Pix do ${getPlan(pixPlanChange).name} é cancelado.`
              : `O primeiro débito${price ? ` de ${price}` : ''} sai hoje, quando você autorizar, e se repete todo mês nessa data.`}
          </div>
        ) : null}

        {error ? (
          <p className="pl-pay-err" role="alert">
            {error}
          </p>
        ) : null}

        <div className="pl-dlg-acts">
          <button
            ref={backRef}
            type="button"
            className="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Voltar
          </button>
          <button
            type="button"
            className="acid"
            disabled={busy}
            onClick={() =>
              onConfirm(
                method,
                method === 'pix' && pixWaits ? 'trial_end' : 'now'
              )
            }
          >
            {pending
              ? 'Abrindo…'
              : method === 'pix'
                ? pixWaits
                  ? 'Pagar com Pix no fim do teste'
                  : 'Autorizar no app do banco'
                : 'Continuar no cartão'}
          </button>
        </div>
        {method === 'pix' && pixWaits ? (
          <button
            type="button"
            className="pl-pay-now"
            disabled={busy}
            onClick={() => onConfirm('pix', 'now')}
          >
            Autorizar agora (o teste acaba hoje)
          </button>
        ) : null}
        <p className="pl-pay-fine">
          {method === 'pix'
            ? 'Pix processado pela AbacatePay. Cancelar é no painel, quando quiser.'
            : 'Cartão processado pelo Stripe. Cancelar é no painel, quando quiser.'}
        </p>
      </DialogContent>
    </Dialog>
  )
}
