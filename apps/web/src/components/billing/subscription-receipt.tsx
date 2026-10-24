import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Icone, Medalha } from '@/components/painel'
import {
  CONTRACTED_TRIAL_LABEL,
  type Plan,
  planChargeFromSubscription
} from '@/lib/plan-catalog'
import {
  formatReceiptDate,
  formatSubscriptionRef,
  type ReceiptStage,
  receiptChargeLabel,
  receiptCycleLabel,
  receiptStampLabel
} from '@/lib/subscription-receipt'
import './subscription-receipt.css'

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Trial gratuito'
}

/**
 * O que o visor da máquina mostra — e o que o leitor de tela anuncia. Antes da
 * confirmação a situação é desconhecida, e quem está em trial passa por
 * `processing` enquanto a consulta carrega: o texto não pode falar em pagamento.
 */
const STAGE_SCREEN: Record<ReceiptStage, string> = {
  processing: 'Confirmando a assinatura',
  printing: 'Imprimindo o comprovante',
  done: 'Assinatura confirmada',
  delayed: 'Confirmação demorando'
}

/**
 * Linhas fixas do papel: cabeçalho, preço, total, os detalhes, o título dos
 * benefícios e o rodapé. As variáveis são os benefícios do plano.
 *
 * O número manda no avanço do motor: são os passos em que o papel sai da
 * fenda, e a duração da impressão é contada a partir dele.
 */
const RECEIPT_STATIC_LINES = 14

/** Nome do keyframe que empurra a folha para fora — ver o CSS ao lado. */
const PAPER_FEED_ANIMATION = 'onside-receipt-feed-out'

export function countReceiptLines(plan: Plan): number {
  return RECEIPT_STATIC_LINES + plan.features.length
}

/** "R$ 269,00", como no papel do design. */
const centavos = (reais: number) =>
  reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "17 OUT 2026 · 21:52". */
function carimboDeHora(date: Date) {
  const dia = date
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
    .replaceAll(' de ', ' ')
    .replace('.', '')
    .toUpperCase()
  const hora = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${dia} · ${hora}`
}

type Props = {
  stage: ReceiptStage
  /** Plano gravado na assinatura — nunca o que a pessoa clicou antes de pagar. */
  plan: Plan | null
  /** Desconto mensal gravado pelo webhook; null se desconhecido. */
  monthlyDiscountReais?: number | null
  status: string
  /** Trial que já é do Stripe (`isContractedTrial`): não é "Trial gratuito". */
  contractedTrial?: boolean
  currentPeriodEnd: Date | string | null
  /** Fim marcado por cancelamento agendado (WEB-335); null sem agendamento. */
  cancelAt: Date | null
  subscriptionRef: string | null
  barName: string | null
  /** Cartão salvo no Stripe (WEB-350); a linha some sem ele. */
  cardLast4?: string | null
  issuedAt: Date
  /** Duração da saída do papel, em ms. Zero com `prefers-reduced-motion`. */
  printDurationMs: number
  /** Passos do motor: um por linha impressa. */
  feedSteps: number
  /**
   * Avisa que a folha terminou de sair. Quem manda é o fim da animação, não um
   * relógio paralelo: em máquina lenta o `setTimeout` acaba antes do papel
   * parar, e o carimbo bateria em recibo ainda em movimento.
   */
  onPrinted: () => void
  /** Saídas da tela. Mudam por estágio; quem monta é a rota. */
  actions: ReactNode
}

/**
 * Recibo de assinatura saindo de uma impressora térmica (WEB-59; telas 3l–3n
 * do painel do bar).
 *
 * A máquina é um objeto: corpo de plástico arredondado, visor afundado e a
 * fenda fina embaixo. O papel não "cresce" embaixo dela — ele já existe
 * inteiro e **desliza para fora da fenda**, em passos de motor, com a borda
 * serrilhada à frente. Enquanto ele não existe (webhook não chegou) a máquina
 * trabalha com o visor ligado e nada sai, que é a verdade do estado.
 *
 * Tudo é CSS: o app inteiro anima em CSS com `prefers-reduced-motion` (ver
 * `app-motion.css`), e uma rota que roda uma vez por assinatura não paga uma
 * dependência de runtime.
 */
export function SubscriptionReceipt({
  stage,
  plan,
  monthlyDiscountReais = null,
  status,
  contractedTrial = false,
  currentPeriodEnd,
  cancelAt,
  subscriptionRef,
  barName,
  cardLast4 = null,
  issuedAt,
  printDurationMs,
  feedSteps,
  onPrinted,
  actions
}: Props) {
  const printed = stage === 'done'
  const hasPaper = (stage === 'printing' || stage === 'done') && plan !== null
  const charge = plan
    ? planChargeFromSubscription(plan, monthlyDiscountReais)
    : null

  return (
    <section
      className="onside-receipt"
      data-stage={stage}
      style={
        {
          '--onside-receipt-feed': `${printDurationMs}ms`,
          '--onside-receipt-steps': Math.max(feedSteps, 1)
        } as CSSProperties
      }
      aria-labelledby="onside-receipt-title"
    >
      <h2 id="onside-receipt-title" className="sr-only">
        Comprovante de assinatura
      </h2>

      <div className="onside-receipt-machine">
        {/* O plano só aparece no corpo quando é o confirmado pelo Stripe. */}
        <div className="onside-receipt-machine-head">
          <div>
            <b>{hasPaper && plan ? `Plano ${plan.name}` : 'Assinatura'}</b>
            <span>
              Mensal
              {barName && hasPaper ? ` · ${barName}` : ''}
            </span>
          </div>
          {hasPaper && charge ? (
            <div className="onside-receipt-machine-total">
              <span>Total</span>
              <b>{centavos(charge.chargeReais)}</b>
            </div>
          ) : null}
        </div>

        {/*
         * O visor é o estado da máquina em texto, e é ele que o leitor de
         * tela anuncia: um `status` visível vale mais que um texto escondido
         * dizendo a mesma coisa duas vezes.
         */}
        <p className="onside-receipt-screen" role="status" aria-live="polite">
          <span className="onside-receipt-screen-icon" aria-hidden="true">
            {printed ? (
              <Icone nome="check" tamanho={13} acento="currentColor" />
            ) : null}
          </span>
          <span className="onside-receipt-screen-text">
            {STAGE_SCREEN[stage]}
          </span>
          <span className="onside-receipt-screen-tag" aria-hidden="true">
            {printed ? (status === 'active' ? 'PAGO' : 'LIBERADO') : '···'}
          </span>
        </p>

        {/* A fenda: a boca por onde o papel sai. */}
        <span className="onside-receipt-slot" aria-hidden="true" />
      </div>

      {hasPaper ? (
        <PaperOutput
          plan={plan}
          monthlyDiscountReais={monthlyDiscountReais}
          status={status}
          contractedTrial={contractedTrial}
          currentPeriodEnd={currentPeriodEnd}
          cancelAt={cancelAt}
          subscriptionRef={subscriptionRef}
          barName={barName}
          cardLast4={cardLast4}
          issuedAt={issuedAt}
          printed={printed}
          onPrinted={onPrinted}
        />
      ) : null}

      <div className="onside-receipt-actions" data-ready={printed}>
        {actions}
      </div>
    </section>
  )
}

type PaperProps = {
  plan: Plan
  monthlyDiscountReais: number | null
  status: string
  contractedTrial: boolean
  currentPeriodEnd: Date | string | null
  cancelAt: Date | null
  subscriptionRef: string | null
  barName: string | null
  cardLast4: string | null
  issuedAt: Date
  printed: boolean
  onPrinted: () => void
}

/**
 * A janela por onde a folha sai.
 *
 * A altura é medida, não interpolada: `grid-template-rows: 0fr → 1fr` parece
 * resolver isso sem JavaScript, mas `fr` não interpola linearmente em pixels —
 * no meio da animação a janela ficava mais curta que o trecho de papel já
 * empurrado, e a serrilha, que precisa estar sempre na boca da fenda, sumia
 * cortada dentro dela. Com a altura real do papel em `--onside-receipt-paper-h`,
 * janela e folha andam em pixels, no mesmo número de passos, e a borda
 * serrilhada fica colada na saída do começo ao fim.
 */
function PaperOutput(props: PaperProps) {
  const paperRef = useRef<HTMLElement | null>(null)
  const [paperHeight, setPaperHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const paper = paperRef.current
    if (!paper) return

    setPaperHeight(paper.offsetHeight)

    // A fonte pode chegar depois e mudar a altura no meio da impressão; sem
    // isto a janela pararia no tamanho antigo e cortaria o fim do recibo.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPaperHeight(entry.target.getBoundingClientRect().height)
    })
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="onside-receipt-output"
      data-ready={paperHeight !== null}
      style={
        paperHeight === null
          ? undefined
          : ({
              '--onside-receipt-paper-h': `${paperHeight}px`
            } as CSSProperties)
      }
    >
      <PaperContent {...props} paperRef={paperRef} />
      {/* Sombra que a máquina joga sobre a folha recém-saída. */}
      <span className="onside-receipt-output-shade" aria-hidden="true" />
    </div>
  )
}

function PaperContent({
  plan,
  monthlyDiscountReais,
  status,
  contractedTrial,
  currentPeriodEnd,
  cancelAt,
  subscriptionRef,
  barName,
  cardLast4,
  issuedAt,
  printed,
  onPrinted,
  paperRef
}: PaperProps & { paperRef: React.RefObject<HTMLElement | null> }) {
  const charge = planChargeFromSubscription(plan, monthlyDiscountReais)
  const paid = status === 'active'
  const details = [
    { label: 'Assinatura', value: formatSubscriptionRef(subscriptionRef) },
    {
      label: 'Situação',
      value: contractedTrial
        ? CONTRACTED_TRIAL_LABEL
        : (STATUS_LABEL[status] ?? status)
    },
    ...(cardLast4
      ? [
          {
            label: paid ? 'Pago com' : 'Cartão',
            value: `Cartão •••• ${cardLast4}`
          }
        ]
      : []),
    { label: 'Data', value: carimboDeHora(issuedAt) },
    { label: 'Ciclo', value: receiptCycleLabel(plan.period, !cancelAt) },
    {
      label: receiptChargeLabel(status, cancelAt !== null),
      value: cancelAt
        ? `${formatReceiptDate(cancelAt)} — o plano segue até lá`
        : formatReceiptDate(currentPeriodEnd)
    }
  ]
  // O número grande do pé: o fim do id da assinatura no Stripe.
  const ref = subscriptionRef?.slice(-4).toUpperCase()

  return (
    <article
      ref={paperRef}
      className="onside-receipt-paper"
      onAnimationEnd={(event) => {
        if (event.animationName === PAPER_FEED_ANIMATION) onPrinted()
      }}
    >
      <header className="onside-receipt-paper-head">
        <div>
          <p className="onside-receipt-title">Plano {plan.name}</p>
          <p className="onside-receipt-meta">
            Mensal{barName ? ` · ${barName}` : ''}
          </p>
        </div>
        <Medalha plano={plan.id} tamanho={34} />
      </header>

      <dl className="onside-receipt-rows">
        <div className="onside-receipt-row">
          <dt>{plan.name} · mensal</dt>
          <dd>{centavos(charge.listReais ?? charge.chargeReais)}</dd>
        </div>
        {charge.listReais != null ? (
          <div className="onside-receipt-row" data-desconto>
            <dt>Desconto de fundador</dt>
            <dd>−{centavos(charge.listReais - charge.chargeReais)}</dd>
          </div>
        ) : null}
      </dl>
      <dl className="onside-receipt-rows">
        <div className="onside-receipt-row" data-total>
          <dt>{paid ? 'Total pago' : 'Total por mês'}</dt>
          <dd>
            {centavos(charge.chargeReais)}
            {paid ? '' : '/mês'}
          </dd>
        </div>
      </dl>
      <dl className="onside-receipt-rows" data-miudo>
        {details.map((row) => (
          <div key={row.label} className="onside-receipt-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="onside-receipt-section">Já está ligado</p>
      <ul className="onside-receipt-features">
        {plan.features.map((feature) => (
          <li key={feature} className="onside-receipt-feature">
            <span aria-hidden="true">+</span>
            {feature}
          </li>
        ))}
      </ul>

      <footer className="onside-receipt-foot">
        {ref ? (
          <p className="onside-receipt-ref" aria-hidden="true">
            SUB {ref}
          </p>
        ) : null}
        {/*
         * O carimbo só bate quando a folha termina de sair: antes disso o
         * papel ainda está preso na máquina, e carimbo em papel preso é
         * promessa, não comprovante. O texto é o da situação: trial não pagou.
         */}
        <p className="onside-receipt-stamp" data-printed={printed}>
          <Icone nome="check" tamanho={12} acento="currentColor" />
          {receiptStampLabel(status)}
        </p>
      </footer>
      <p className="onside-receipt-legal">
        Comprovante de contratação, não é documento fiscal. As faturas ficam no
        portal da Stripe, em Plano e cobrança.
      </p>
    </article>
  )
}
