import { randomUUID } from 'node:crypto'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { createPub, inDays } from '../../fixtures/pubs'
import { deliverSubscription, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// `/plan` e `/plan/confirmed` com `billing.checkout_enabled` no padrão
// (desligado). O checkout ligado está em `checkout.serial.e2e.ts`.

/** A marca que `/plan` grava antes de mandar para o Stripe (WEB-59). */
const CHECKOUT_INTENT_KEY = 'onside:checkout-intent'

test('mostra Starter, Pro e Elite para quem ainda não assinou', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('heading', { name: 'Escolha o plano do seu bar.' })
  ).toBeVisible()
  for (const plan of ['Starter', 'Pro', 'Elite']) {
    await expect(
      page.getByRole('radio', { name: new RegExp(`^${plan},`) })
    ).toHaveCount(1)
  }
})

test('diz em nome de quem a assinatura sai, com o caminho para corrigir o bar (WEB-328)', async ({
  page
}) => {
  const { user, barId } = await createPub({
    subscription: null,
    user: { name: 'Dona Marta' }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // O checkout não pede nome nem empresa: saem do cadastro, e a tela avisa.
  await expect(
    page.getByText(
      `Assinatura em nome de Dona Marta · Bar E2E ${barId.slice(0, 8)}.`
    )
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Alterar o nome do bar' })
  ).toHaveAttribute('href', '/admin#admin-espaco')
})

test('pagamento pendente: aviso para regularizar, sem checkout novo', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: { plan: 'pro', status: 'past_due' }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('Pagamento pendente')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Regularize seu plano Pro.' })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(
    page.getByRole('button', { name: /^Continuar com/ })
  ).toHaveCount(0)
  // WEB-328: sem checkout, não há o que anunciar.
  await expect(page.getByText(/Assinatura em nome de/)).toHaveCount(0)
})

// WEB-249: o trial do onboarding é uma linha local, sem assinatura no
// provedor. Vencido, não há o que regularizar: o bar ainda não contratou. O
// clique que abre o checkout está em `checkout.serial.e2e.ts`.
test('trial encerrado sem assinatura no provedor: checkout do plano do trial', async ({
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

  await expect(page.getByText('Trial encerrado')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Continue no plano Elite.' })
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Elite,/ })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Continuar com Elite' })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveCount(0)
})

test('trial encerrado com assinatura no provedor: regulariza, sem checkout novo', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(-1),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Continuar com/ })
  ).toHaveCount(0)
})

test('trial em vigor: sem cartão, e contratar qualquer plano já é possível (WEB-31)', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(14)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // WEB-261: quem ainda não paga não lê "alterar plano" nem "ciclo de cobrança".
  await expect(
    page.getByRole('heading', { name: /^Você está no trial do Elite até / })
  ).toBeVisible()
  await expect(page.getByText('Alterar plano')).toHaveCount(0)
  await expect(page.getByText(/ciclo de cobrança/)).toHaveCount(0)
  await expect(page.getByText('O teste grátis não pede cartão.')).toBeVisible()
  await expect(
    page.getByText(/primeira cobrança só sai em \d+ de /)
  ).toBeVisible()

  // WEB-249: abre no plano do trial, não num inferior a um clique do checkout.
  await expect(page.getByRole('radio', { name: /^Elite,/ })).toBeChecked()
  await expect(page.getByText(/plano inferior ao atual/)).toHaveCount(0)
  // O plano do teste ainda não foi contratado: o botão contrata, não diz
  // "Plano atual". Fica desabilitado aqui só porque o checkout está desligado.
  await expect(page.getByRole('button', { name: 'Plano atual' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Contratar Elite' })
  ).toBeVisible()

  await page.getByRole('radio', { name: /^Pro,/ }).check({ force: true })
  await expect(
    page.getByRole('button', { name: 'Contratar Pro' })
  ).toBeVisible()
  await expect(page.getByText(/plano inferior ao atual/)).toBeVisible()
})

test('trial que já é do Stripe: troca de plano, com o plano contratado como atual', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(14),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('Alterar plano')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Pro,/ })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Plano atual' })).toBeDisabled()
})

test('assinatura paga abre no próprio plano, sem checkout de outro por padrão', async ({
  page
}) => {
  const { user } = await createPub({ subscription: { plan: 'starter' } })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByRole('radio', { name: /^Starter,/ })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Plano atual' })).toBeDisabled()
})

test('checkout desligado: aviso na tela e o servidor recusa com CHECKOUT_DISABLED', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByText('A contratação de planos está temporariamente indisponível.')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continuar com Pro' })
  ).toBeDisabled()

  // A tela é só sugestão: quem chama o endpoint direto também é barrado.
  const response = await page.request.post('/api/auth/subscription/upgrade', {
    data: { plan: 'pro', successUrl: '/plan/confirmed', cancelUrl: '/plan' },
    headers: { origin: BASE_URL }
  })
  expect(response.status()).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'CHECKOUT_DISABLED' })
})

test('/plan/confirmed sem a marca do checkout volta para /plan', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan/confirmed')

  await expect(page).toHaveURL(/\/plan$/)
  await expect(
    page.getByRole('heading', { name: 'Escolha o plano do seu bar.' })
  ).toBeVisible()
})

test('/plan/confirmed com a marca espera o webhook e imprime o recibo', async ({
  page,
  request
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  // A marca vive no localStorage da origem: grava numa página do app antes.
  await page.goto('/plan')
  // Em string: o tsconfig da suíte não carrega os tipos do DOM.
  await page.evaluate(
    `localStorage.setItem(${JSON.stringify(CHECKOUT_INTENT_KEY)}, ${JSON.stringify(
      JSON.stringify({ plan: 'pro', expiresAt: Date.now() + 30 * 60_000 })
    )})`
  )

  await page.goto('/plan/confirmed')
  // O visor da impressora é o `status` que anuncia cada estágio.
  const screen = page.locator('.onside-receipt-screen')
  await expect(screen).toHaveText(/Confirmando a assinatura/)
  await expect(page).toHaveURL(/\/plan\/confirmed$/)

  const subscriptionId = `sub_e2e_${user.id}`
  const webhook = await deliverSubscription(
    request,
    'customer.subscription.created',
    stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'pro',
      userId: user.id,
      founderDiscount: true
    })
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)

  // A tela consulta a cada 2s; o recibo sai e é carimbado.
  await expect(screen).toHaveText(/Comprovante impresso/, { timeout: 20_000 })
  const receipt = page.locator('.onside-receipt-paper')
  await expect(receipt).toContainText('Pago e liberado')
  await expect(receipt).toContainText('R$ 119/mês (tabela cheia R$ 147/mês)')
  await expect(receipt).toContainText(subscriptionId.slice(-16))
  // Recibo confirmado apaga a marca.
  const { origins } = await page.context().storageState()
  expect(
    origins.flatMap((origin) => origin.localStorage).map((item) => item.name)
  ).not.toContain(CHECKOUT_INTENT_KEY)
})

test('/plan/confirmed de quem contratou no teste grátis espera o Stripe, não imprime o plano do teste (WEB-31)', async ({
  page,
  request
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
  await page.evaluate(
    `localStorage.setItem(${JSON.stringify(CHECKOUT_INTENT_KEY)}, ${JSON.stringify(
      JSON.stringify({ plan: 'starter', expiresAt: Date.now() + 30 * 60_000 })
    )})`
  )

  await page.goto('/plan/confirmed')
  const screen = page.locator('.onside-receipt-screen')
  // O bar já tem plano vigente (o teste do Elite), mas o que ele contratou
  // ainda não chegou: a tela espera em vez de imprimir o Elite.
  await expect(screen).toHaveText(/Confirmando a assinatura/)

  const webhook = await deliverSubscription(
    request,
    'customer.subscription.created',
    stripeSubscription({
      id: `sub_e2e_${user.id}`,
      status: 'trialing',
      plan: 'starter',
      userId: user.id,
      currentPeriodEnd: trialEnd
    })
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)

  await expect(screen).toHaveText(/Comprovante impresso/, { timeout: 20_000 })
  const receipt = page.locator('.onside-receipt-paper')
  await expect(receipt).toContainText('Starter')
  await expect(receipt).toContainText('Trial gratuito')
})

test.describe('torcedor', () => {
  test.use({ storageState: storageState('fan') })

  for (const path of ['/plan', '/plan/confirmed']) {
    test(`${path} manda para /dashboard`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/dashboard$/)
    })
  }
})
