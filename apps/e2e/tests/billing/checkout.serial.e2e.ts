import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import { sendStripeWebhook, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Serial porque liga `billing.checkout_enabled`, global.

test.afterEach(resetAppConfig)

/**
 * Corpo da sessão de checkout que o app pediu ao Stripe para este dono. O
 * corpo é formulário, com as chaves como o SDK manda (`line_items[0][price]`).
 */
async function checkoutSessionOf(page: Page, userId: string) {
  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  return calls.find(
    (call) =>
      call.path === '/checkout/sessions' &&
      call.body['metadata[userId]'] === userId
  )?.body
}

test('trial vencido sem assinatura no provedor: o botão padrão contrata o plano do trial e cobra na hora (WEB-249)', async ({
  page
}) => {
  await setAppConfig('billing.checkout_enabled', true)
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(-1)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // Sem escolher nada: a tela abre no plano do trial.
  await page.getByRole('button', { name: 'Continuar com Elite' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)

  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    'line_items[0][price]': 'price_e2e_elite_monthly'
  })
  // Teste vencido não é herdado: a primeira cobrança é agora.
  expect(session).not.toHaveProperty('subscription_data[trial_end]')
})

test('checkout ligado: o clique abre a sessão e redireciona para o Stripe', async ({
  page
}) => {
  await setAppConfig('billing.checkout_enabled', true)
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  const navigations: string[] = []
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.url().startsWith(`${STUB_URL}/stripe/checkout/`)
    ) {
      navigations.push(request.url())
    }
  })

  await page.getByRole('radio', { name: /^Elite,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Continuar com Elite' }).click()

  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  await expect(page).toHaveTitle('Stripe (stub)')
  // WEB-241: o cliente do better-auth já navega com a resposta do checkout.
  // Um segundo `location.href` no app abortava a primeira navegação, e este
  // teste falhava de vez em quando com `net::ERR_ABORTED`.
  expect(navigations).toHaveLength(1)

  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    mode: 'subscription',
    locale: 'pt-BR',
    'line_items[0][price]': 'price_e2e_elite_monthly',
    // O retorno do provedor cai no recibo, que espera o webhook (WEB-59).
    success_url: expect.stringMatching(/callbackURL=%2Fplan%2Fconfirmed/)
  })
  // Sem a chave do cupom de fundador ligada, o checkout sai a preço de tabela.
  expect(session).not.toHaveProperty('discounts[0][coupon]')
})

test('teste grátis em vigor: contrata já, e a primeira cobrança fica para o fim do teste (WEB-31)', async ({
  page
}) => {
  await setAppConfig('billing.checkout_enabled', true)
  const trialEnd = inDays(100)
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: trialEnd
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('O teste grátis não pede cartão.')).toBeVisible()
  await page.getByRole('button', { name: 'Contratar Elite' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)

  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    'line_items[0][price]': 'price_e2e_elite_monthly',
    'subscription_data[trial_end]': String(
      Math.floor(trialEnd.getTime() / 1000)
    )
  })
})

test('cupom de fundador: ligado entra no checkout, esgotado não trava a venda (WEB-31)', async ({
  browser
}) => {
  await setAppConfig('billing.checkout_enabled', true)

  async function contractPro(couponId: string) {
    await setAppConfig('billing.founder_coupon', { enabled: true, couponId })
    const { user } = await createPub({ subscription: null })
    const context = await browser.newContext()
    const page = await context.newPage()
    await signIn(page, user)
    await page.goto('/plan')
    await page.getByRole('button', { name: 'Continuar com Pro' }).click()
    await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
    const session = await checkoutSessionOf(page, user.id)
    await context.close()
    return session
  }

  expect(await contractPro('eM7dQpMF')).toMatchObject({
    'discounts[0][coupon]': 'eM7dQpMF'
  })
  // O stub responde `valid: false` para este id, como um cupom que bateu o
  // teto de usos no Stripe.
  const semCupom = await contractPro('esgotado')
  expect(semCupom).toBeDefined()
  expect(semCupom).not.toHaveProperty('discounts[0][coupon]')
})

test('checkout concluído: o bar fica ativo no plano pago, e contratar de novo vira troca no portal, não segunda assinatura (WEB-172)', async ({
  page,
  request
}) => {
  await setAppConfig('billing.checkout_enabled', true)
  const { user, barId } = await createPub({
    subscription: null,
    bar: { is_active: false }
  })
  await signIn(page, user)
  await page.goto('/plan')
  await page.getByRole('button', { name: 'Continuar com Pro' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)
  if (!session) throw new Error('sessão de checkout não foi criada')

  // O dono paga no Stripe: a assinatura passa a existir lá, e o Stripe avisa
  // o fim do checkout com os dados que o plugin gravou na sessão.
  const subscription = stripeSubscription({
    id: `sub_e2e_${barId}`,
    status: 'active',
    plan: 'pro',
    userId: user.id,
    customerId: session.customer
  })
  await request.post(`${STUB_URL}/stripe/subscriptions`, { data: subscription })
  const webhook = await sendStripeWebhook(request, {
    id: `evt_e2e_checkout_${barId}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_e2e_concluida',
        object: 'checkout.session',
        mode: 'subscription',
        subscription: subscription.id,
        client_reference_id: user.id,
        metadata: {
          userId: user.id,
          referenceId: user.id,
          subscriptionId: session['metadata[subscriptionId]']
        }
      }
    }
  })
  expect(webhook.ok(), await webhook.text()).toBe(true)

  // As duas tabelas em dia: a nossa, que o app lê, e a do plugin, que impede a
  // segunda assinatura.
  const [state] = await query<Record<string, unknown>>(
    `SELECT s.status, s.plan, s.provider, s.external_subscription_id, b.is_active,
            p.status AS plugin_status, p.stripe_subscription_id AS plugin_subscription
       FROM bar b
       JOIN subscription s ON s.bar_id = b.id
       JOIN stripe_subscription p ON p.reference_id = b.user_id
      WHERE b.id = $1`,
    [barId]
  )
  expect(state).toEqual({
    status: 'active',
    plan: 'pro',
    provider: 'stripe',
    external_subscription_id: subscription.id,
    is_active: true,
    plugin_status: 'active',
    plugin_subscription: subscription.id
  })

  // Quem já paga e escolhe outro plano confirma a troca no portal do Stripe.
  await page.goto('/plan')
  await page.getByRole('radio', { name: /^Elite,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Continuar com Elite' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/portal/**`)

  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  const ofOwner = calls.filter(
    (call) => call.body.customer === session.customer
  )
  expect(
    ofOwner.filter((call) => call.path === '/checkout/sessions')
  ).toHaveLength(1)
  expect(
    ofOwner.find((call) => call.path === '/billing_portal/sessions')?.body
  ).toMatchObject({
    'flow_data[type]': 'subscription_update_confirm',
    'flow_data[subscription_update_confirm][subscription]': subscription.id,
    'flow_data[subscription_update_confirm][items][0][price]':
      'price_e2e_elite_monthly'
  })
})
