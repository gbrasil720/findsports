import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { PRODUCT_ID } from '../../fixtures/dodo-payloads'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Serial porque liga `billing.checkout_enabled`, global.

test.afterEach(resetAppConfig)

test('trial vencido sem assinatura no provedor: o botão padrão contrata o plano do trial (WEB-249)', async ({
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
  await page.waitForURL(`${STUB_URL}/dodo/checkout/**`)

  const calls = (await (
    await page.request.get(`${STUB_URL}/dodo/calls`)
  ).json()) as { path: string; body: Record<string, unknown> }[]
  const checkout = calls.find(
    (call) =>
      call.path === '/checkouts' &&
      (call.body.customer as { email?: string } | undefined)?.email ===
        user.email
  )
  expect(checkout?.body).toMatchObject({
    product_cart: [expect.objectContaining({ product_id: PRODUCT_ID.elite })]
  })
})

test('checkout ligado: o clique abre a sessão e redireciona para a Dodo', async ({
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
      request.url().startsWith(`${STUB_URL}/dodo/checkout/`)
    ) {
      navigations.push(request.url())
    }
  })

  await page.getByRole('radio', { name: /^Elite,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Continuar com Elite' }).click()

  await page.waitForURL(`${STUB_URL}/dodo/checkout/**`)
  await expect(page).toHaveTitle('Dodo (stub)')
  // WEB-241: o cliente do better-auth já navega com a resposta do checkout.
  // Um segundo `location.href` no app abortava a primeira navegação, e este
  // teste falhava de vez em quando com `net::ERR_ABORTED`.
  expect(navigations).toHaveLength(1)

  const calls = (await (
    await page.request.get(`${STUB_URL}/dodo/calls`)
  ).json()) as { path: string; body: Record<string, unknown> }[]
  const checkout = calls.find(
    (call) =>
      call.path === '/checkouts' &&
      (call.body.customer as { email?: string } | undefined)?.email ===
        user.email
  )
  expect(checkout?.body).toMatchObject({
    product_cart: [expect.objectContaining({ product_id: PRODUCT_ID.elite })],
    // O retorno do provedor cai no recibo, que espera o webhook (WEB-59).
    return_url: expect.stringMatching(/\/plan\/confirmed$/)
  })
})
