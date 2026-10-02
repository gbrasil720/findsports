import { SAO_PAULO, STUB_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { interceptBlobUploads } from '../../fixtures/blob'
import { query } from '../../fixtures/db'
import { sendDodoWebhook } from '../../fixtures/dodo'
import { lastEmailTo } from '../../fixtures/email'
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

test('webhook da Dodo assinado passa da verificação de assinatura', async ({
  request
}) => {
  const payload = { type: 'e2e.signature-check' }

  const forged = await sendDodoWebhook(request, payload, {
    secret: `whsec_${Buffer.from('outro-segredo').toString('base64')}`
  })
  expect(forged.status()).toBe(400)
  expect(await forged.text()).toMatch(/signature/i)

  // Assinatura certa: a recusa agora é do esquema do corpo, não da assinatura.
  const signed = await sendDodoWebhook(request, payload)
  expect(signed.status()).toBe(400)
  expect(await signed.text()).not.toMatch(/signature/i)
})

test('upload para o Vercel Blob é interceptado no navegador', async ({
  page
}) => {
  const uploads = await interceptBlobUploads(page)
  await page.goto('/')

  const blob = await page.evaluate(async () => {
    const put = await fetch(
      'https://vercel.com/api/blob/?pathname=bars/x/photo',
      { method: 'PUT', headers: { authorization: 'Bearer t' }, body: 'x' }
    )
    const { url } = (await put.json()) as { url: string }
    const image = await fetch(url)
    return { url, type: image.headers.get('content-type') }
  })

  expect(uploads).toEqual([
    expect.objectContaining({ pathname: 'bars/x/photo' })
  ])
  expect(blob).toEqual({
    url: 'https://e2e.public.blob.vercel-storage.com/bars/x/photo',
    type: 'image/png'
  })
})

test.describe('mapa', () => {
  test.use({ storageState: storageState('fan') })

  test('carrega os tiles do stub, sem erro', async ({ page }) => {
    const tiles = page.waitForResponse(`${STUB_URL}/tiles.pmtiles`)
    await page.goto('/dashboard')
    expect((await tiles).ok()).toBe(true)
    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
