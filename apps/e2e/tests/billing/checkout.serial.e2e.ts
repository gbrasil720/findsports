import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import {
  sendStripeWebhook,
  setAnnualPrices,
  setFounderCoupon,
  stripeSubscription
} from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Serial porque troca o que o stub do Stripe diz do cupom de fundador, que é
// global: os testes paralelos contam com o cupom valendo.

test.afterEach(async ({ request }) => {
  await setFounderCoupon(request, 'valid')
  await setAnnualPrices(request, false)
})

/** Com o Pix ligado, contratar passa por "Como você quer pagar?": cartão. */
async function continueWithCard(page: Page) {
  await page
    .getByRole('dialog', { name: 'Como você quer pagar?' })
    .getByRole('button', { name: 'Continuar no cartão' })
    .click()
}

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

  // O plano do teste vencido é o que o cartão escuro e a faixa contratam.
  await page.getByRole('button', { name: 'Contratar o Elite' }).last().click()
  await continueWithCard(page)
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

  // Cada cartão contrata o próprio plano.
  await page.getByRole('button', { name: 'Contratar o Elite' }).click()
  await continueWithCard(page)

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

  // No celular a versão longa do subtítulo fica oculta; o texto continua na página.
  await expect(page.getByText('O teste grátis não pede cartão.')).toBeAttached()
  await page.getByRole('button', { name: 'Contratar o Elite' }).click()
  await continueWithCard(page)
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

    const elite = page.locator('.pl-pc').filter({
      has: page.getByRole('heading', { name: 'Elite', exact: true })
    })
    await expect(elite).toContainText('R$ 297')
    await expect(page.getByText('R$ 269')).toHaveCount(0)

    await page.getByRole('button', { name: 'Contratar o Pro' }).first().click()
    await continueWithCard(page)
    await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
    const session = await checkoutSessionOf(page, user.id)
    expect(session).toMatchObject({
      'line_items[0][price]': 'price_e2e_pro_monthly',
      allow_promotion_codes: 'true'
    })
    expect(session).not.toHaveProperty('discounts[0][coupon]')
  })
}

test('/admin/billing: com o cupom esgotado, o card do plano do trial mostra a tabela cheia (WEB-343)', async ({
  page,
  request
}) => {
  await setFounderCoupon(request, 'exhausted')
  const { user } = await createPub({
    subscription: { plan: 'elite', status: 'trialing' }
  })
  await signIn(page, user)
  await page.goto('/admin/billing')

  const currentPlan = page.getByRole('region', { name: 'Seu plano' })
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
  await page.getByRole('button', { name: 'Contratar o Pro' }).first().click()
  await continueWithCard(page)
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
  // Só depois de a assinatura carregar o cartão do Elite troca de plano.
  await expect(
    page.getByRole('button', { name: 'Seu plano atual' })
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Mudar para o Elite' }).click()
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

test('/admin/billing: com o Stripe sem responder ao cupom, o card do plano do trial sai do "Carregando preço…" (WEB-534)', async ({
  page,
  request
}) => {
  await setFounderCoupon(request, 'slow')
  const { user } = await createPub({
    subscription: { plan: 'elite', status: 'trialing' }
  })
  await signIn(page, user)
  await page.goto('/admin/billing')

  // O servidor desiste do Stripe em 5 s (`QUICK_REQUEST`) e responde. Stripe
  // sem resposta não é cupom esgotado: vale o de fundador, como no checkout.
  const currentPlan = page.getByRole('region', { name: 'Seu plano' })
  await expect(currentPlan).toContainText('R$ 269', { timeout: 15_000 })
  await expect(currentPlan).not.toContainText('Carregando preço')
})

// WEB-442: anual = 10 meses, no cartão, com o desconto de fundador pelo cupom
// do anual (dono, 14/11/2026); o teste do cadastro vale igual. O preço anual
// vira o mesmo plano na nossa tabela.
test('anual no teste grátis: checkout com o cupom de fundador do anual e a mesma primeira cobrança, e o painel diz o valor do ano (WEB-442)', async ({
  page,
  request
}) => {
  await setAnnualPrices(request, true)
  const trialEnd = inDays(20)
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: trialEnd
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await page
    .getByRole('group', { name: 'Cobrança' })
    .getByRole('button', { name: /^Anual/ })
    .click()
  const pro = page.getByRole('listitem', { name: 'Pro' })
  // Fundador valendo (o padrão do stub): 10 × R$ 119, riscando 12 × R$ 119.
  await expect(pro).toContainText('R$ 1.190')
  await expect(pro).toContainText('R$ 1.428')
  await expect(pro).toContainText('/ano')
  await expect(pro).toContainText('Economize R$ 238')
  await expect(
    page.getByText('O teste grátis e o desconto de fundador valem nos dois.')
  ).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Starter' })).toContainText(
    'Economize R$ 138'
  )
  await page.getByRole('button', { name: 'Contratar o Pro anual' }).click()
  await continueWithCard(page)
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)

  const session = await checkoutSessionOf(page, user.id)
  if (!session) throw new Error('sessão de checkout não foi criada')
  expect(session).toMatchObject({
    'line_items[0][price]': 'price_e2e_pro_yearly',
    'subscription_data[trial_end]': String(
      Math.floor(trialEnd.getTime() / 1000)
    )
  })
  expect(session['discounts[0][coupon]']).toBe('fundador_anual')
  expect(session).not.toHaveProperty('allow_promotion_codes')

  // O dono conclui o checkout: a assinatura anual, ainda no teste.
  const subscription = stripeSubscription({
    id: `sub_e2e_${barId}`,
    status: 'trialing',
    plan: 'pro',
    interval: 'year',
    founderDiscount: true,
    userId: user.id,
    customerId: session.customer,
    currentPeriodEnd: trialEnd
  })
  await request.post(`${STUB_URL}/stripe/subscriptions`, { data: subscription })
  const webhook = await sendStripeWebhook(request, {
    id: `evt_e2e_checkout_anual_${barId}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_e2e_anual',
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

  const [state] = await query<Record<string, unknown>>(
    `SELECT s.status, s.plan, s.monthly_discount_reais, p.billing_interval
       FROM subscription s
       JOIN bar b ON b.id = s.bar_id
       JOIN stripe_subscription p ON p.reference_id = b.user_id
      WHERE s.bar_id = $1`,
    [barId]
  )
  expect(state).toEqual({
    status: 'trialing',
    plan: 'pro',
    monthly_discount_reais: 280,
    billing_interval: 'year'
  })

  await page.goto('/admin/billing')
  const currentPlan = page.getByRole('region', { name: 'Seu plano' })
  await expect(currentPlan).toContainText('R$ 1.190')
  await expect(currentPlan).toContainText('por ano')
})

test('anual sem vaga de fundador: 10 meses de tabela, sem cupom no checkout (WEB-442)', async ({
  page,
  request
}) => {
  await setAnnualPrices(request, true)
  await setFounderCoupon(request, 'exhausted')
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(20)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')
  await page
    .getByRole('group', { name: 'Cobrança' })
    .getByRole('button', { name: /^Anual/ })
    .click()
  const pro = page.getByRole('listitem', { name: 'Pro' })
  await expect(pro).toContainText('R$ 1.470')
  await expect(pro).toContainText('Economize R$ 294')
  await expect(page.getByText('O teste grátis vale nos dois.')).toBeVisible()
  await page.getByRole('button', { name: 'Contratar o Pro anual' }).click()
  await continueWithCard(page)
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    'line_items[0][price]': 'price_e2e_pro_yearly'
  })
  expect(session).not.toHaveProperty('discounts[0][coupon]')
  expect(session).not.toHaveProperty('allow_promotion_codes')
})
