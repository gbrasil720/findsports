import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Serial porque liga `billing.checkout_enabled`, global.

test.afterEach(resetAppConfig)

test('checkout do Stripe vai para o stub', async ({ page }) => {
  await setAppConfig('billing.checkout_enabled', true)
  const owner = await createUser({ role: 'pub' })
  await signIn(page, owner)

  const checkout = await page.request.post('/api/auth/subscription/upgrade', {
    data: {
      plan: 'pro',
      successUrl: '/plan/confirmed',
      cancelUrl: '/plan',
      disableRedirect: true
    },
    headers: { origin: BASE_URL }
  })
  expect(checkout.ok(), await checkout.text()).toBe(true)
  expect((await checkout.json()).url).toContain(`${STUB_URL}/stripe/checkout/`)

  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  // O cliente no Stripe nasce no primeiro checkout, com o e-mail do dono.
  expect(calls).toContainEqual(
    expect.objectContaining({
      path: '/customers',
      body: expect.objectContaining({ email: owner.email })
    })
  )
  expect(calls).toContainEqual(
    expect.objectContaining({
      path: '/checkout/sessions',
      body: expect.objectContaining({
        'metadata[userId]': owner.id,
        'line_items[0][price]': 'price_e2e_pro_monthly'
      })
    })
  )
})
