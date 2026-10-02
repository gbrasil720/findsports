import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { PRODUCT_ID } from '../../fixtures/dodo-payloads'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Serial porque liga `billing.checkout_enabled`, global.

test.afterEach(resetAppConfig)

test('checkout ligado: o clique abre a sessão e redireciona para a Dodo', async ({
  page
}) => {
  await setAppConfig('billing.checkout_enabled', true)
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  await page.getByRole('radio', { name: /^Elite,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Continuar com Elite' }).click()

  await page.waitForURL(`${STUB_URL}/dodo/checkout/**`)
  await expect(page).toHaveTitle('Dodo (stub)')

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
