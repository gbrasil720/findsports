import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Serial porque liga `billing.checkout_enabled`, global. A sessão de checkout
// sai por um cliente da Dodo que o `@dodopayments/core` monta sozinho, não
// pelo `dodoClient` — por isso o desvio é no `fetch` (`stubs/dodo-api.mjs`).

test.afterEach(resetAppConfig)

test('checkout da Dodo vai para o stub', async ({ page }) => {
  await setAppConfig('billing.checkout_enabled', true)
  const owner = await createUser({ role: 'pub' })
  await signIn(page, owner)

  const checkout = await page.request.post(
    '/api/auth/dodopayments/checkout-session',
    { data: { slug: 'pro' }, headers: { origin: BASE_URL } }
  )
  expect(checkout.ok(), await checkout.text()).toBe(true)
  expect((await checkout.json()).url).toContain(`${STUB_URL}/dodo/checkout/`)

  const calls = (await (
    await page.request.get(`${STUB_URL}/dodo/calls`)
  ).json()) as { path: string; body: unknown }[]
  expect(calls).toContainEqual(
    expect.objectContaining({
      path: '/checkouts',
      body: expect.objectContaining({
        customer: expect.objectContaining({ email: owner.email })
      })
    })
  )
})
