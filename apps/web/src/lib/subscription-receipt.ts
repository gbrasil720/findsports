import type { SubscriptionPlan } from '@findsports_oficial/db'

/**
 * Regras da tela de conclusão de assinatura (WEB-59).
 *
 * A confirmação de uma assinatura não chega pelo redirect do provedor: quem
 * grava `status: 'active'` é o webhook `onSubscriptionActive`, e ele pode
 * chegar depois do navegador. Tudo aqui existe para atravessar essa janela
 * sem mentir — nem afirmar pagamento que não está no nosso banco, nem
 * declarar falha de algo que provavelmente deu certo.
 *
 * O módulo é puro de propósito: o teto de espera, a decisão de sair da tela e
 * o estágio do recibo são as três regras que precisam de teste, e nenhuma
 * delas depende de React, de rede ou do relógio de parede.
 */

/** Intenção de checkout — nossa, não do provedor. Ver `hasCheckoutIntent`. */
export const CHECKOUT_INTENT_KEY = 'onside:checkout-intent'

/**
 * Uma sessão de checkout do provedor não sobrevive a meia hora de abandono, e
 * a marca só serve para decidir se vale esperar o webhook nesta tela.
 */
const CHECKOUT_INTENT_TTL_MS = 30 * 60 * 1000

/** Intervalo entre consultas a `pub.getMySubscription` durante a espera. */
export const RECEIPT_POLL_INTERVAL_MS = 2000

/**
 * Os dois tetos do contrato. O de tentativas fecha o caso normal (rede boa,
 * webhook que não vem); o de tempo fecha o caso em que as consultas ficam
 * penduradas e o de tentativas nunca é atingido.
 */
export const RECEIPT_MAX_ATTEMPTS = 20
export const RECEIPT_MAX_WAIT_MS = 45_000

/**
 * O avanço do papel é por passo, como o motor de uma impressora térmica: cada
 * passo empurra uma linha do comprovante para fora da fenda. É daí que sai a
 * duração da impressão — recibo com mais linhas leva mais tempo para sair.
 */
export const RECEIPT_FEED_STEP_MS = 95

export type ReceiptStage = 'processing' | 'printing' | 'done' | 'delayed'

export type ReceiptSubscription = {
  status: string
  currentPlan: SubscriptionPlan | null
  currentPeriodEnd: Date | string | null
  dodoSubscriptionId?: string | null
} | null

/**
 * A autoridade é a assinatura no nosso banco, nunca a query string do
 * provedor. `currentPlan` já vem do servidor com a regra de trial vencido
 * aplicada (`getCurrentPlan`), então um `trialing` com período no passado não
 * conta como confirmado nem aqui nem no painel.
 */
export function isSubscriptionConfirmed(
  subscription: ReceiptSubscription
): boolean {
  if (!subscription) return false
  if (subscription.currentPlan === null) return false
  return subscription.status === 'active' || subscription.status === 'trialing'
}

export function serializeCheckoutIntent(
  plan: SubscriptionPlan,
  now = Date.now()
): string {
  return JSON.stringify({ plan, expiresAt: now + CHECKOUT_INTENT_TTL_MS })
}

export function parseCheckoutIntent(
  value: string | null,
  now = Date.now()
): SubscriptionPlan | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as {
      plan?: unknown
      expiresAt?: unknown
    }
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
      return null
    }
    if (
      parsed.plan !== 'starter' &&
      parsed.plan !== 'pro' &&
      parsed.plan !== 'elite'
    ) {
      return null
    }
    return parsed.plan
  } catch {
    return null
  }
}

/**
 * Marca que *nós* mandamos esta pessoa para o checkout. Não afirma pagamento
 * — só distingue quem está voltando do provedor, e merece esperar o webhook,
 * de quem digitou a URL do recibo sem ter assinatura.
 */
export function markCheckoutIntent(plan: SubscriptionPlan): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      CHECKOUT_INTENT_KEY,
      serializeCheckoutIntent(plan)
    )
  } catch {
    // Safari em navegação privada lança ao escrever. Sem a marca a tela do
    // recibo devolve para `/plan` em vez de esperar — pior, não quebrado.
  }
}

export function readCheckoutIntent(): SubscriptionPlan | null {
  if (typeof window === 'undefined') return null
  try {
    return parseCheckoutIntent(window.localStorage.getItem(CHECKOUT_INTENT_KEY))
  } catch {
    return null
  }
}

export function clearCheckoutIntent(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CHECKOUT_INTENT_KEY)
  } catch {
    // A marca expira sozinha em 30 minutos.
  }
}

/**
 * Continuar consultando ou desistir da espera.
 *
 * `exhausted` não é fracasso: é o fim da janela em que faz sentido segurar
 * alguém olhando papel sair de impressora.
 */
export function resolveReceiptWait(input: {
  confirmed: boolean
  attempts: number
  elapsedMs: number
}): { shouldPoll: boolean; exhausted: boolean } {
  if (input.confirmed) return { shouldPoll: false, exhausted: false }

  const exhausted =
    input.attempts >= RECEIPT_MAX_ATTEMPTS ||
    input.elapsedMs >= RECEIPT_MAX_WAIT_MS

  return { shouldPoll: !exhausted, exhausted }
}

/**
 * Confirmado vence teto estourado: o webhook pode chegar com a aba em segundo
 * plano, e voltar para ela tem de mostrar o recibo, não a tela de demora.
 */
export function resolveReceiptStage(input: {
  confirmed: boolean
  exhausted: boolean
  printed: boolean
}): ReceiptStage {
  if (input.confirmed) return input.printed ? 'done' : 'printing'
  if (input.exhausted) return 'delayed'
  return 'processing'
}

/**
 * Quem chega sem assinatura nenhuma e sem ter passado pelo checkout não tem
 * recibo para ver — vai escolher um plano. Quem tem a marca do checkout fica,
 * mesmo sem assinatura ainda gravada: é exatamente a janela do webhook.
 */
export function shouldLeaveReceipt(input: {
  confirmed: boolean
  hasCheckoutIntent: boolean
}): boolean {
  return !input.confirmed && !input.hasCheckoutIntent
}

/** Quanto dura a saída de um recibo de `lineCount` linhas, em passos de motor. */
export function receiptPrintDurationMs(lineCount: number): number {
  if (lineCount <= 0) return 0
  return lineCount * RECEIPT_FEED_STEP_MS
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function formatReceiptDate(date: Date | string | null): string {
  if (!date) return '—'
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

export function formatReceiptTimestamp(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * `trialing` ainda não cobrou nada: chamar de "próxima cobrança" faria o dono
 * procurar uma cobrança anterior que não existe.
 */
export function receiptChargeLabel(status: string): string {
  return status === 'trialing' ? 'Primeira cobrança' : 'Próxima cobrança'
}

/**
 * O ciclo sai do próprio catálogo (`period`), e não de um texto novo: plano
 * cobrado por outro intervalo passa a imprimir o intervalo certo sem que esta
 * tela precise saber que ele existe.
 */
export function receiptCycleLabel(period: string): string {
  const normalized = period.trim().replace(/^\//, '').toLowerCase()
  if (normalized === 'mês' || normalized === 'mes') {
    return 'Mensal, renovação automática'
  }
  if (normalized === 'ano') return 'Anual, renovação automática'
  return `Por ${normalized}, renovação automática`
}

/** Referência curta da assinatura, para citar no suporte. */
export function formatSubscriptionRef(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length <= 20 ? id : `…${id.slice(-16)}`
}
