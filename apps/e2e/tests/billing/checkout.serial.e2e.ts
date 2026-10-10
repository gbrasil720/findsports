import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import {
  sendStripeWebhook,
  setFounderCoupon,
  stripeSubscription
} from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Serial porque troca o que o stub do Stripe diz do cupom de fundador, que é
// global: os testes paralelos contam com o cupom valendo.

test.afterEach(({ request }) => setFounderCoupon(request, 'valid'))

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

/** O que o app gravou no cliente do Stripe (`POST /v1/customers/{id}`), em ordem. */
async function customerUpdatesOf(page: Page, customerId: string | undefined) {
  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { method: string; path: string; body: Record<string, string> }[]
  return calls
    .filter(
      (call) =>
        call.method === 'POST' && call.path === `/customers/${customerId}`
    )
    .map((call) => call.body)
}

test('trial vencido sem assinatura no provedor: o botão padrão contrata o plano do trial e cobra na hora (WEB-249)', async ({
  page
}) => {
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

test('o clique abre a sessão e redireciona para o Stripe, com o cupom de fundador', async ({
  page
}) => {
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
  // WEB-31: todo checkout novo sai com o cupom de fundador. O Stripe recusa
  // cupom e código promocional na mesma sessão.
  expect(session).not.toHaveProperty('allow_promotion_codes')
  expect(session).toMatchObject({
    'discounts[0][coupon]': 'eM7dQpMF',
    // O checkout pede endereço e, opcional, o CNPJ. Sempre em BRL.
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    'customer_update[name]': 'auto',
    'customer_update[address]': 'auto',
    'adaptive_pricing[enabled]': 'false'
  })
  // WEB-328: nome de quem paga e nome da empresa não são pedidos no checkout.
  expect(
    Object.keys(session ?? {}).filter((key) =>
      key.startsWith('name_collection')
    )
  ).toEqual([])

  // Vêm do cadastro, gravados no cliente do Stripe antes de a sessão abrir,
  // junto do endereço do bar.
  expect(await customerUpdatesOf(page, session?.customer)).toEqual([
    {
      name: user.name,
      individual_name: user.name,
      business_name: expect.stringMatching(/^Bar E2E /),
      'address[line1]': 'Rua Augusta, 100',
      'address[line2]': 'Consolação',
      'address[city]': 'São Paulo',
      'address[country]': 'BR'
    }
  ])
})

test('teste grátis em vigor: contrata já, e a primeira cobrança fica para o fim do teste (WEB-31)', async ({
  page
}) => {
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

// O id do cupom é constante do código (WEB-233): numa conta do Stripe em que
// ele não existe, ou depois de esgotado, a venda segue a preço de tabela. O
// stub recusa a sessão que mandar cupom nesses dois estados, como o Stripe.
for (const [state, caso] of [
  ['exhausted', 'esgotado'],
  ['missing', 'que não existe nesta conta do Stripe']
] as const) {
  test(`cupom de fundador ${caso}: não trava a venda nem promete desconto em /plan (WEB-31)`, async ({
    page,
    request
  }) => {
    await setFounderCoupon(request, state)
    const { user } = await createPub({ subscription: null })
    await signIn(page, user)
    await page.goto('/plan')

    await expect(
      page.getByRole('radio', { name: /^Elite, R\$ 297\/mês\./ })
    ).toBeVisible()
    await expect(page.getByRole('radio', { name: /R\$ 269/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Continuar com Pro' }).click()
    await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
    const session = await checkoutSessionOf(page, user.id)
    expect(session).toMatchObject({
      'line_items[0][price]': 'price_e2e_pro_monthly',
      allow_promotion_codes: 'true'
    })
    expect(session).not.toHaveProperty('discounts[0][coupon]')
  })
}

test('/admin/billing: com o cupom esgotado, o card Plano atual do trial mostra a tabela cheia (WEB-343)', async ({
  page,
  request
}) => {
  await setFounderCoupon(request, 'exhausted')
  const { user } = await createPub({
    subscription: { plan: 'elite', status: 'trialing' }
  })
  await signIn(page, user)
  await page.goto('/admin/billing')

  const currentPlan = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Plano atual' })
  })
  await expect(currentPlan).toContainText('R$ 297')
  await expect(currentPlan).not.toContainText('R$ 269')
})

test('checkout concluído: o bar fica ativo no plano pago, e contratar de novo vira troca no portal, não segunda assinatura (WEB-172)', async ({
  page,
  request
}) => {
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
        customer: session.customer,
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

  // WEB-328: o checkout pode ter gravado outro nome no cliente; o webhook
  // devolve o do cadastro, e só o nome — o endereço é do dono.
  expect((await customerUpdatesOf(page, session.customer)).at(-1)).toEqual({
    name: user.name,
    individual_name: user.name,
    business_name: expect.stringMatching(/^Bar E2E /)
  })

  // Quem já paga e escolhe outro plano confirma a troca no portal do Stripe.
  await page.goto('/plan')
  // Só depois de a assinatura carregar a tela abre no plano pago; clicar antes
  // disso, com a página ainda hidratando, não troca a seleção.
  await expect(page.getByRole('radio', { name: /^Pro,/ })).toBeChecked()
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

test('assinatura parada no Stripe: o servidor recusa checkout novo e manda regularizar (WEB-172)', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'past_due',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)

  // A tela não oferece checkout para plano parado (WEB-170); o que se prova
  // aqui é o servidor, para quem chama a rota direto ou tem uma aba antiga.
  const response = await page.request.post('/api/auth/subscription/upgrade', {
    data: {
      plan: 'pro',
      successUrl: '/plan/confirmed',
      cancelUrl: '/plan',
      disableRedirect: true
    },
    headers: { origin: BASE_URL }
  })
  expect(response.status(), await response.text()).toBe(409)
  expect(await response.json()).toMatchObject({
    code: 'SUBSCRIPTION_PAST_DUE',
    message: expect.stringContaining('Assinatura e pagamentos')
  })
  // Nada foi pedido ao Stripe: nem cliente, nem sessão.
  expect(await checkoutSessionOf(page, user.id)).toBeUndefined()
})
