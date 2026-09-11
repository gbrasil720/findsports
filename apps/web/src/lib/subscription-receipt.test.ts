import { describe, expect, test } from 'bun:test'

import {
  formatReceiptDate,
  formatSubscriptionRef,
  isSubscriptionConfirmed,
  parseCheckoutIntent,
  RECEIPT_FEED_STEP_MS,
  RECEIPT_MAX_ATTEMPTS,
  RECEIPT_MAX_WAIT_MS,
  receiptChargeLabel,
  receiptPrintDurationMs,
  resolveReceiptStage,
  resolveReceiptWait,
  serializeCheckoutIntent,
  shouldLeaveReceipt
} from '@/lib/subscription-receipt'

describe('isSubscriptionConfirmed', () => {
  test('assinatura ausente não confirma nada', () => {
    expect(isSubscriptionConfirmed(null)).toBe(false)
  })

  test('active com plano vigente confirma', () => {
    expect(
      isSubscriptionConfirmed({
        status: 'active',
        currentPlan: 'pro',
        currentPeriodEnd: null
      })
    ).toBe(true)
  })

  test('trialing com plano vigente confirma', () => {
    expect(
      isSubscriptionConfirmed({
        status: 'trialing',
        currentPlan: 'starter',
        currentPeriodEnd: new Date('2027-01-01')
      })
    ).toBe(true)
  })

  test('trial vencido não confirma — o servidor já zerou o plano', () => {
    expect(
      isSubscriptionConfirmed({
        status: 'trialing',
        currentPlan: null,
        currentPeriodEnd: new Date('2020-01-01')
      })
    ).toBe(false)
  })

  test('past_due e inactive não confirmam', () => {
    for (const status of ['past_due', 'inactive', 'cancelled']) {
      expect(
        isSubscriptionConfirmed({
          status,
          currentPlan: 'pro',
          currentPeriodEnd: null
        })
      ).toBe(false)
    }
  })
})

describe('resolveReceiptWait', () => {
  test('confirmado para de consultar sem estourar teto', () => {
    expect(
      resolveReceiptWait({ confirmed: true, attempts: 99, elapsedMs: 99_999 })
    ).toEqual({ shouldPoll: false, exhausted: false })
  })

  test('dentro dos dois tetos continua consultando', () => {
    expect(
      resolveReceiptWait({ confirmed: false, attempts: 3, elapsedMs: 6000 })
    ).toEqual({ shouldPoll: true, exhausted: false })
  })

  test('teto de tentativas encerra a espera', () => {
    expect(
      resolveReceiptWait({
        confirmed: false,
        attempts: RECEIPT_MAX_ATTEMPTS,
        elapsedMs: 1000
      })
    ).toEqual({ shouldPoll: false, exhausted: true })
  })

  test('teto de tempo encerra a espera mesmo com poucas tentativas', () => {
    expect(
      resolveReceiptWait({
        confirmed: false,
        attempts: 2,
        elapsedMs: RECEIPT_MAX_WAIT_MS
      })
    ).toEqual({ shouldPoll: false, exhausted: true })
  })
})

describe('resolveReceiptStage', () => {
  test('esperando o webhook fica em processamento', () => {
    expect(
      resolveReceiptStage({
        confirmed: false,
        exhausted: false,
        printed: false
      })
    ).toBe('processing')
  })

  test('confirmado imprime antes de concluir', () => {
    expect(
      resolveReceiptStage({ confirmed: true, exhausted: false, printed: false })
    ).toBe('printing')
    expect(
      resolveReceiptStage({ confirmed: true, exhausted: false, printed: true })
    ).toBe('done')
  })

  test('teto estourado sem confirmação vira demora, não falha', () => {
    expect(
      resolveReceiptStage({ confirmed: false, exhausted: true, printed: false })
    ).toBe('delayed')
  })

  test('webhook que chega depois do teto ainda imprime o recibo', () => {
    expect(
      resolveReceiptStage({ confirmed: true, exhausted: true, printed: false })
    ).toBe('printing')
  })
})

describe('shouldLeaveReceipt', () => {
  test('sem assinatura e sem checkout, volta para os planos', () => {
    expect(
      shouldLeaveReceipt({ confirmed: false, hasCheckoutIntent: false })
    ).toBe(true)
  })

  test('voltando do checkout, espera o webhook', () => {
    expect(
      shouldLeaveReceipt({ confirmed: false, hasCheckoutIntent: true })
    ).toBe(false)
  })

  test('assinatura confirmada fica, mesmo sem marca de checkout', () => {
    expect(
      shouldLeaveReceipt({ confirmed: true, hasCheckoutIntent: false })
    ).toBe(false)
  })
})

describe('intenção de checkout', () => {
  test('ida e volta preserva o plano', () => {
    const now = Date.UTC(2026, 8, 10)
    expect(parseCheckoutIntent(serializeCheckoutIntent('pro', now), now)).toBe(
      'pro'
    )
  })

  test('marca expirada não conta', () => {
    const now = Date.UTC(2026, 8, 10)
    const value = serializeCheckoutIntent('pro', now)
    expect(parseCheckoutIntent(value, now + 31 * 60 * 1000)).toBeNull()
  })

  test('valor ausente, quebrado ou de plano desconhecido não conta', () => {
    expect(parseCheckoutIntent(null)).toBeNull()
    expect(parseCheckoutIntent('não é json')).toBeNull()
    expect(
      parseCheckoutIntent(
        JSON.stringify({ plan: 'gratuito', expiresAt: Date.now() + 1000 })
      )
    ).toBeNull()
    expect(parseCheckoutIntent(JSON.stringify({ plan: 'pro' }))).toBeNull()
  })
})

describe('receiptPrintDurationMs', () => {
  test('recibo vazio não tem impressão', () => {
    expect(receiptPrintDurationMs(0)).toBe(0)
  })

  test('uma linha dura um passo do motor', () => {
    expect(receiptPrintDurationMs(1)).toBe(RECEIPT_FEED_STEP_MS)
  })

  test('cresce com o número de linhas', () => {
    expect(receiptPrintDurationMs(6)).toBeGreaterThan(receiptPrintDurationMs(3))
  })
})

describe('formatação do recibo', () => {
  test('data ausente ou inválida vira travessão', () => {
    expect(formatReceiptDate(null)).toBe('—')
    expect(formatReceiptDate('data inválida')).toBe('—')
  })

  test('data válida sai por extenso', () => {
    expect(formatReceiptDate('2026-10-15T12:00:00.000Z')).toContain('outubro')
  })

  test('trial fala de primeira cobrança', () => {
    expect(receiptChargeLabel('trialing')).toBe('Primeira cobrança')
    expect(receiptChargeLabel('active')).toBe('Próxima cobrança')
  })

  test('referência longa é truncada pelo fim, que é a parte útil', () => {
    expect(formatSubscriptionRef(null)).toBe('—')
    expect(formatSubscriptionRef('sub_123')).toBe('sub_123')
    expect(formatSubscriptionRef('sub_0123456789abcdefghij')).toBe(
      '…456789abcdefghij'
    )
  })
})
