import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { sendDodoWebhook } from '../../fixtures/dodo'
import { subscriptionWebhook } from '../../fixtures/dodo-payloads'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// `/plan` e `/plan/confirmed` com `billing.checkout_enabled` no padrão
// (desligado). O checkout ligado está em `checkout.serial.e2e.ts`.

/** A marca que `/plan` grava antes de mandar para a Dodo (WEB-59). */
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
})

test('trial encerrado: aviso para continuar no plano', async ({ page }) => {
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
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toBeVisible()
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
  const response = await page.request.post(
    '/api/auth/dodopayments/checkout-session',
    { data: { slug: 'pro' }, headers: { origin: BASE_URL } }
  )
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
  await expect(screen).toHaveText(/Confirmando o pagamento/)
  await expect(page).toHaveURL(/\/plan\/confirmed$/)

  const subscriptionId = `sub_e2e_${user.id}`
  const webhook = await sendDodoWebhook(
    request,
    subscriptionWebhook('subscription.active', {
      email: user.email,
      subscriptionId,
      plan: 'pro'
    })
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)

  // A tela consulta a cada 2s; o recibo sai e é carimbado.
  await expect(screen).toHaveText(/Comprovante impresso/, { timeout: 20_000 })
  const receipt = page.locator('.onside-receipt-paper')
  await expect(receipt).toContainText('Pago e liberado')
  await expect(receipt).toContainText(subscriptionId.slice(-16))
  // Recibo confirmado apaga a marca.
  const { origins } = await page.context().storageState()
  expect(
    origins.flatMap((origin) => origin.localStorage).map((item) => item.name)
  ).not.toContain(CHECKOUT_INTENT_KEY)
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
