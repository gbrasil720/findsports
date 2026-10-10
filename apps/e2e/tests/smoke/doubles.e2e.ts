import { BASE_URL, MEDIA_PUBLIC_ORIGIN, SAO_PAULO, STUB_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { interceptMediaUploads } from '../../fixtures/media'
import { sendStripeWebhook } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Prova que cada dublê da fundação está ligado no servidor de verdade. Se um
// destes cai, os testes de área que dependem dele mentem.

test('e-mail cai no outbox, com o link do app', async ({ page }) => {
  const fan = await createUser()
  const response = await page.request.post('/api/auth/request-password-reset', {
    data: { email: fan.email, redirectTo: '/reset-password' }
  })
  expect(response.ok()).toBe(true)

  const email = await lastEmailTo(fan.email)
  expect(email.subject).toBe('Redefina a senha da sua conta Onside')
  expect(email.link).toContain('/reset-password')
})

test('geocoding vai para o stub da LocationIQ, inclusive o modo de erro', async ({
  page
}) => {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  const completePub = (address: string) =>
    page.request.post('/api/trpc/onboarding.completePub', {
      data: { name: 'Bar do Stub', neighborhood: 'Centro', address }
    })

  const falha = await completePub(`Rua falha-geocoding ${owner.id}`)
  expect(falha.status()).toBe(503)

  const street = `Rua do Stub ${owner.id}`
  expect((await completePub(street)).ok()).toBe(true)
  const calls = (await (
    await page.request.get(`${STUB_URL}/locationiq/calls`)
  ).json()) as { street: string }[]
  expect(calls.map((c) => c.street)).toContain(street)
  const [bar] = await query('SELECT latitude FROM bar WHERE user_id = $1', [
    owner.id
  ])
  expect(Number(bar?.latitude)).toBeCloseTo(SAO_PAULO.latitude)
})

test('webhook do Stripe: assinatura errada é recusada, a certa passa', async ({
  request
}) => {
  // Evento que o app ignora: o que se prova aqui é só a assinatura.
  const event = {
    id: 'evt_e2e_signature_check',
    object: 'event',
    type: 'e2e.signature-check',
    data: { object: {} }
  }

  const forged = await sendStripeWebhook(request, event, {
    secret: 'whsec_outro_segredo'
  })
  expect(forged.status()).toBe(400)

  const signed = await sendStripeWebhook(request, event)
  expect(signed.ok(), await signed.text()).toBe(true)
})

test('API do Stripe vai para o stub: portal', async ({ page }) => {
  const owner = await createUser({ role: 'pub' })
  const customerId = `cus_e2e_smoke_${owner.id}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    owner.id
  ])
  await signIn(page, owner)

  const portal = await page.request.post(
    '/api/auth/subscription/billing-portal',
    {
      data: { returnUrl: '/admin/billing', disableRedirect: true },
      headers: { origin: BASE_URL }
    }
  )
  expect(portal.ok(), await portal.text()).toBe(true)
  expect((await portal.json()).url).toBe(
    `${STUB_URL}/stripe/portal/${customerId}`
  )

  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  expect(calls).toContainEqual(
    expect.objectContaining({
      path: '/billing_portal/sessions',
      body: expect.objectContaining({ customer: customerId })
    })
  )
})

test('upload para o R2 é interceptado no navegador', async ({ page }) => {
  const uploads = await interceptMediaUploads(page)
  await page.goto('/')

  const result = await page.evaluate(async (origin) => {
    const put = await fetch(
      'https://e2e.r2.cloudflarestorage.com/onside-media/bars/x/photo?X-Amz-Signature=x',
      { method: 'PUT', headers: { 'content-type': 'image/png' }, body: 'x' }
    )
    const image = await fetch(`${origin}/bars/x/photo?v=1`)
    return { put: put.status, type: image.headers.get('content-type') }
  }, MEDIA_PUBLIC_ORIGIN)

  expect(uploads).toEqual([
    { pathname: 'bars/x/photo', contentType: 'image/png' }
  ])
  expect(result).toEqual({ put: 200, type: 'image/png' })
})

test.describe('mapa', () => {
  test.use({ storageState: storageState('fan') })

  test('carrega os tiles do stub, sem erro', async ({ page }) => {
    const tiles = page.waitForResponse(`${STUB_URL}/tiles.json`)
    await page.goto('/dashboard')
    expect((await tiles).ok()).toBe(true)
    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
