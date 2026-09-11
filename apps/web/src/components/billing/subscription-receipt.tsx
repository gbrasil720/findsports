import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Clock from 'reicon-react/icons/Clock'
import Loader from 'reicon-react/icons/Loader'
import type { Plan } from '@/lib/plan-catalog'
import {
  formatReceiptDate,
  formatReceiptTimestamp,
  formatSubscriptionRef,
  type ReceiptStage,
  receiptChargeLabel,
  receiptCycleLabel
} from '@/lib/subscription-receipt'

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Trial gratuito'
}

/** O que o visor da máquina mostra — e o que o leitor de tela anuncia. */
const STAGE_SCREEN: Record<ReceiptStage, string> = {
  processing: 'Confirmando o pagamento',
  printing: 'Imprimindo comprovante',
  done: 'Comprovante impresso',
  delayed: 'Confirmação demorando'
}

/**
 * Linhas fixas do papel: título, meta, as cinco linhas do plano, o título da
 * seção de benefícios e o rodapé. As variáveis são os benefícios do plano.
 *
 * O número manda no avanço do motor: são os passos em que o papel sai da
 * fenda, e a duração da impressão é contada a partir dele.
 */
const RECEIPT_STATIC_LINES = 9

/** Nome do keyframe que empurra a folha para fora — ver o CSS ao lado. */
const PAPER_FEED_ANIMATION = 'onside-receipt-feed-out'

export function countReceiptLines(plan: Plan): number {
  return RECEIPT_STATIC_LINES + plan.features.length
}

type Props = {
  stage: ReceiptStage
  /** Plano gravado na assinatura — nunca o que a pessoa clicou antes de pagar. */
  plan: Plan | null
  status: string
  currentPeriodEnd: Date | string | null
  subscriptionRef: string | null
  barName: string | null
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
  /** Bloco de texto do estágio sem recibo (processando ou demora). */
  waitingSlot: ReactNode
}

/**
 * Recibo de assinatura saindo de uma impressora térmica (WEB-59).
 *
 * A máquina é um objeto: corpo ink com sombra dura, visor de status e a fenda
 * no rasgo de baixo. O papel não "cresce" embaixo dela — ele já existe inteiro
 * e **desliza para fora da fenda**, em passos de motor, com a borda serrilhada
 * à frente. Enquanto ele não existe (webhook não chegou) a máquina trabalha
 * com o visor ligado e nada sai, que é a verdade do estado.
 *
 * Tudo é CSS: a referência do ticket usa Framer Motion, mas o app inteiro
 * anima em CSS com `prefers-reduced-motion` (ver `app-motion.css`), e uma rota
 * que roda uma vez por assinatura não paga uma dependência de runtime.
 */
export function SubscriptionReceipt({
  stage,
  plan,
  status,
  currentPeriodEnd,
  subscriptionRef,
  barName,
  issuedAt,
  printDurationMs,
  feedSteps,
  onPrinted,
  actions,
  waitingSlot
}: Props) {
  const printed = stage === 'done'
  const hasPaper = (stage === 'printing' || stage === 'done') && plan !== null

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
      <h1 id="onside-receipt-title" className="sr-only">
        Comprovante de assinatura
      </h1>

      <div className="onside-receipt-machine">
        <div className="onside-receipt-machine-face">
          <p className="onside-receipt-plate" aria-hidden="true">
            <span className="onside-receipt-plate-brand">Onside</span>
            <span className="onside-receipt-plate-model">Term-01</span>
          </p>

          {/*
           * O visor é o estado da máquina em texto, e é ele que o leitor de
           * tela anuncia: um `status` visível vale mais que um texto escondido
           * dizendo a mesma coisa duas vezes.
           */}
          <p className="onside-receipt-screen" role="status" aria-live="polite">
            <StageIcon stage={stage} />
            <span className="onside-receipt-screen-text">
              {STAGE_SCREEN[stage]}
            </span>
            <span className="onside-receipt-screen-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </p>
        </div>

        {/* Lábio da fenda: a boca por onde o papel sai. */}
        <div className="onside-receipt-lip" aria-hidden="true">
          <span className="onside-receipt-slot">
            <span className="onside-receipt-feed" />
          </span>
        </div>
      </div>

      {hasPaper ? (
        <PaperOutput
          plan={plan}
          status={status}
          currentPeriodEnd={currentPeriodEnd}
          subscriptionRef={subscriptionRef}
          barName={barName}
          issuedAt={issuedAt}
          printed={printed}
          onPrinted={onPrinted}
        />
      ) : (
        <div className="onside-receipt-waiting">{waitingSlot}</div>
      )}

      <div className="onside-receipt-actions">{actions}</div>
    </section>
  )
}

function StageIcon({ stage }: { stage: ReceiptStage }) {
  if (stage === 'done') {
    return (
      <span className="onside-receipt-screen-icon is-done">
        <Check size={14} color="currentColor" aria-hidden="true" />
      </span>
    )
  }

  if (stage === 'delayed') {
    return (
      <span className="onside-receipt-screen-icon is-waiting">
        <Clock size={14} color="currentColor" aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className="onside-receipt-screen-icon">
      <Loader
        size={14}
        color="currentColor"
        className="animate-spin"
        aria-hidden="true"
      />
    </span>
  )
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
function PaperOutput(props: {
  plan: Plan
  status: string
  currentPeriodEnd: Date | string | null
  subscriptionRef: string | null
  barName: string | null
  issuedAt: Date
  printed: boolean
  onPrinted: () => void
}) {
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
  status,
  currentPeriodEnd,
  subscriptionRef,
  barName,
  issuedAt,
  printed,
  onPrinted,
  paperRef
}: {
  plan: Plan
  status: string
  currentPeriodEnd: Date | string | null
  subscriptionRef: string | null
  barName: string | null
  issuedAt: Date
  printed: boolean
  onPrinted: () => void
  paperRef: React.RefObject<HTMLElement | null>
}) {
  const rows = [
    { label: 'Plano', value: `${plan.name} — ${plan.tagline}` },
    { label: 'Valor', value: `${plan.price}${plan.period}` },
    { label: 'Ciclo', value: receiptCycleLabel(plan.period) },
    { label: 'Situação', value: STATUS_LABEL[status] ?? status },
    {
      label: receiptChargeLabel(status),
      value: formatReceiptDate(currentPeriodEnd)
    }
  ]

  return (
    <article
      ref={paperRef}
      className="onside-receipt-paper"
      onAnimationEnd={(event) => {
        if (event.animationName === PAPER_FEED_ANIMATION) onPrinted()
      }}
    >
      <header className="onside-receipt-paper-head">
        <p className="onside-receipt-title">Comprovante de assinatura</p>
        <p className="onside-receipt-meta">
          {barName ? `${barName} • ` : ''}
          {formatReceiptTimestamp(issuedAt)}
        </p>
      </header>

      <dl className="onside-receipt-rows">
        {rows.map((row) => (
          <div key={row.label} className="onside-receipt-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="onside-receipt-section">O que este plano libera</p>

      <ul className="onside-receipt-features">
        {plan.features.map((feature) => (
          <li key={feature} className="onside-receipt-feature">
            <span aria-hidden="true">+</span>
            {feature}
          </li>
        ))}
      </ul>

      <footer className="onside-receipt-foot">
        <p className="onside-receipt-ref">
          Assinatura {formatSubscriptionRef(subscriptionRef)}
        </p>
        <p className="onside-receipt-legal">
          Comprovante de contratação, não é documento fiscal. O histórico de
          pagamentos fica em Assinatura e pagamentos.
        </p>
        {/*
         * O carimbo só bate quando a folha termina de sair: antes disso o
         * papel ainda está preso na máquina, e carimbo em papel preso é
         * promessa, não comprovante.
         */}
        <p className="onside-receipt-stamp" data-printed={printed}>
          <Check size={14} color="currentColor" aria-hidden="true" />
          Pago e liberado
        </p>
      </footer>
    </article>
  )
}
