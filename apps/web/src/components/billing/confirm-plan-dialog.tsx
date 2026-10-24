import type { SubscriptionPlan } from '@findsports_oficial/db'
import { Link } from '@tanstack/react-router'
import { Botao, Card, EmBreve, Icone, Medalha } from '@/components/painel'
import {
  FOUNDER_DISCOUNT,
  formatPlanPrice,
  getPlan,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import { PainelModal } from './planos'

const dia = (date: Date) =>
  date
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    .replaceAll(' de ', ' ')
    .replace('.', '')

/**
 * Confirmar a contratação (3j/3k). Resume plano, desconto de fundador, o que
 * sai hoje e quando vem a primeira cobrança; o botão leva ao checkout do
 * Stripe, onde o cartão é digitado. Esta página não coleta cartão.
 */
export function ConfirmPlanDialog({
  plan,
  barName,
  ownerName,
  founderCouponAvailable,
  trialEnd,
  loading,
  error,
  onConfirm,
  onClose
}: {
  plan: SubscriptionPlan
  barName: string | null
  ownerName: string | null
  /** `null` enquanto a consulta do cupom não responde. */
  founderCouponAvailable: boolean | null
  /** Teste do cadastro em vigor: o checkout manda `trial_end` e hoje sai R$ 0. */
  trialEnd: Date | null
  loading: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const info = getPlan(plan)
  const charge = planChargeForShowcase(info, founderCouponAvailable)
  const today = trialEnd ? 0 : charge?.chargeReais
  const linhas: [string, string, boolean?][] = [
    [`Plano ${info.name}`, `${formatPlanPrice(info.tablePrice)}/mês`],
    ...(charge?.listReais != null
      ? [
          [
            'Desconto de fundador',
            `−${formatPlanPrice(FOUNDER_DISCOUNT)}/mês`,
            true
          ] as [string, string, boolean]
        ]
      : []),
    ['Total', charge ? `${formatPlanPrice(charge.chargeReais)}/mês` : '…']
  ]

  return (
    <PainelModal
      titulo={`Confirmar ${info.name}`}
      subtitulo={barName ? `${barName} · mensal` : 'Mensal'}
      icone={<Medalha plano={plan} tamanho={52} />}
      onClose={onClose}
    >
      <Card className="!px-4 !py-1">
        {linhas.map(([rotulo, valor, desconto], index) => (
          <div
            key={rotulo}
            className={`flex justify-between gap-3 py-[11px] text-[14.5px] ${index ? 'border-[var(--painel-line)] border-t' : ''} ${desconto ? 'text-[var(--painel-live)]' : ''} ${index === linhas.length - 1 ? 'font-bold' : ''}`}
          >
            <span>{rotulo}</span>
            <span>{valor}</span>
          </div>
        ))}
      </Card>

      <div className="flex items-end justify-between gap-4 rounded-[7px] bg-[var(--painel-surface-ink)] px-[18px] py-4 text-[var(--painel-paper)] shadow-[4px_4px_0_var(--painel-acid)]">
        <div>
          <div className="text-[#aaa9a4] text-[12.5px]">Hoje você paga</div>
          <div className="font-[family-name:var(--onside-display)] text-[44px] text-[var(--painel-acid)] leading-none">
            {today === undefined ? '…' : formatPlanPrice(today)}
          </div>
        </div>
        {trialEnd ? (
          <div className="text-right">
            <div className="text-[#aaa9a4] text-[12.5px]">
              Primeira cobrança
            </div>
            <b className="text-[15px]">{dia(trialEnd)}</b>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <span className="flex h-[46px] items-center justify-center gap-2 rounded-[6px] bg-[var(--painel-field)] font-bold text-[14.5px] shadow-[inset_0_0_0_1.5px_var(--painel-fg)]">
          <Icone nome="card" tamanho={18} />
          Cartão
        </span>
        <span
          aria-disabled="true"
          className="flex h-[46px] items-center justify-center gap-2 rounded-[6px] font-bold text-[14.5px] text-[var(--painel-muted)] shadow-[inset_0_0_0_1px_var(--painel-line2)]"
        >
          PIX <EmBreve />
        </span>
      </div>

      <ul className="flex flex-col gap-[7px] text-[13px] text-[var(--painel-muted)]">
        {[
          'O cartão é digitado no checkout seguro da Stripe, no próximo passo',
          'Cancele quando quiser',
          'A troca de plano vale na hora, com a diferença acertada de forma proporcional'
        ].map((item, index) => (
          <li key={item} className="flex items-center gap-2">
            <Icone
              nome={index === 0 ? 'lock' : 'check'}
              tamanho={14}
              acento="currentColor"
            />
            {item}
          </li>
        ))}
      </ul>

      {/* WEB-328: o checkout não pede nome nem empresa; saem do cadastro. */}
      {ownerName && barName ? (
        <p className="text-[13px] text-[var(--painel-muted)]">
          Assinatura em nome de{' '}
          <b className="text-[var(--painel-fg)]">{ownerName}</b> ·{' '}
          <b className="text-[var(--painel-fg)]">{barName}</b>.{' '}
          <Link
            to="/admin/meu-espaco"
            className="font-bold text-[var(--painel-fg)] underline underline-offset-2"
          >
            Alterar o nome do bar
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13.5px] text-[var(--painel-live)]">
          {error}
        </p>
      ) : null}

      <Botao
        variante="acid"
        altura={52}
        className="w-full text-[15px]"
        disabled={loading || today === undefined}
        onClick={onConfirm}
      >
        {loading
          ? 'Redirecionando…'
          : `Confirmar · ${today === undefined ? '…' : formatPlanPrice(today)} hoje`}
      </Botao>
    </PainelModal>
  )
}
