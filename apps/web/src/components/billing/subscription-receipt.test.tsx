import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { getPlan, isContractedTrial } from '@/lib/plan-catalog'
import { SubscriptionReceipt } from './subscription-receipt'

function receipt(subscription: {
  status: string
  standing: 'current'
  externalSubscriptionId: string | null
}) {
  return renderToStaticMarkup(
    <SubscriptionReceipt
      stage="done"
      plan={getPlan('pro')}
      status={subscription.status}
      contractedTrial={isContractedTrial(subscription)}
      currentPeriodEnd="2026-11-10T12:00:00.000Z"
      cancelAt={null}
      subscriptionRef={subscription.externalSubscriptionId}
      barName="Bar do Zé"
      issuedAt={new Date('2026-10-10T12:00:00.000Z')}
      printDurationMs={0}
      feedSteps={1}
      onPrinted={() => {}}
      actions={null}
      waitingSlot={null}
    />
  )
}

// Mesmo critério do selo de `/admin/billing` (WEB-347).
describe('situação no comprovante', () => {
  test('quem contratou durante o teste lê "Contratado · em teste"', () => {
    const markup = receipt({
      status: 'trialing',
      standing: 'current',
      externalSubscriptionId: 'sub_123'
    })
    expect(markup).toContain('Contratado · em teste')
    expect(markup).not.toContain('Trial gratuito')
  })

  test('teste do cadastro, sem assinatura no Stripe, segue "Trial gratuito"', () => {
    const markup = receipt({
      status: 'trialing',
      standing: 'current',
      externalSubscriptionId: null
    })
    expect(markup).toContain('Trial gratuito')
    expect(markup).not.toContain('Contratado')
  })

  test('assinatura paga segue "Ativa"', () => {
    const markup = receipt({
      status: 'active',
      standing: 'current',
      externalSubscriptionId: 'sub_123'
    })
    expect(markup).toContain('Ativa')
    expect(markup).not.toContain('Contratado')
  })
})
