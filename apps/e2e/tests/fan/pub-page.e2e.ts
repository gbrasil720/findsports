import { randomUUID } from 'node:crypto'
import { storageState } from '../../fixtures/auth'
import { createEvent, days, hours, team } from '../../fixtures/fan'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// O link de um bar, `/pub/$pubId` (design 4x–4z): o web é só para bares, e a
// página do bar virou "O <bar> está no app", aberta sem sessão.

test('mostra o cartão do bar e o caminho para o app', async ({
  page,
  isMobile
}) => {
  const name = `Bar Link ${randomUUID().slice(0, 6)}`
  const { barId } = await createPub({
    bar: { name, neighborhood: 'Vila Madalena' }
  })
  const [corinthians, palmeiras] = await Promise.all([
    team('corinthians'),
    team('palmeiras')
  ])
  await createEvent({
    barId,
    startsAt: hours(-1),
    teamIds: [corinthians.id, palmeiras.id]
  })

  const response = await page.goto(`/pub/${barId}`)
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(`${name} — Onside`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/
  )
  await expect(
    page.getByRole('heading', { level: 1, name: `${name} está no app.` })
  ).toBeVisible()

  // O cartão: Elite (o padrão do `createPub`), ao vivo e o jogo.
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('Vila Madalena · São Paulo')).toBeVisible()
  await expect(page.getByText('Elite', { exact: true })).toBeVisible()
  await expect(page.getByText('Ao vivo', { exact: true })).toBeVisible()
  await expect(
    page.getByText(`${corinthians.name} × ${palmeiras.name}`)
  ).toBeVisible()

  if (isMobile) {
    // 4z: o "Abrir no app" leva ao bar no app.
    await expect(
      page.getByRole('link', { name: 'Abrir no app' })
    ).toHaveAttribute('href', `onside://bar/${barId}`)
  } else {
    // 4x: o QR leva a esta página, que no celular tem o "Abrir no app".
    await expect(
      page.getByRole('img', { name: 'QR code: abre esta página no celular' })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Abrir no app' })).toBeHidden()
  }
})

test('bar sem plano e sem jogo: só nome e bairro', async ({ page }) => {
  const name = `Bar Quieto ${randomUUID().slice(0, 6)}`
  const { barId } = await createPub({ bar: { name }, subscription: null })

  await page.goto(`/pub/${barId}`)
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('Elite', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Ao vivo', { exact: true })).toHaveCount(0)
})

test('jogo de outro dia leva o dia junto da hora', async ({ page }) => {
  const { barId } = await createPub()
  const freeText = `Jogo ${randomUUID().slice(0, 6)}`
  await createEvent({ barId, startsAt: days(3), freeText })

  await page.goto(`/pub/${barId}`)
  await expect(page.getByText(freeText)).toBeVisible()
  await expect(page.locator('.entrada-teaser-hora')).toHaveText(
    /^\p{L}{3} \d{2}:\d{2}$/u
  )
})

test('bar inexistente é 404 e bar fora do ar fica sem cartão', async ({
  page
}) => {
  const missing = await page.goto(`/pub/${randomUUID()}`)
  expect(missing?.status()).toBe(404)

  const { barId } = await createPub({ bar: { is_active: false } })
  const offAir = await page.goto(`/pub/${barId}`)
  expect(offAir?.status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'A Onside para torcedores está no app.'
    })
  ).toBeVisible()
})

test.describe('com sessão de torcedor', () => {
  test.use({ storageState: storageState('fan') })

  test('o link do bar abre a mesma página', async ({ page }) => {
    const name = `Bar do Fã ${randomUUID().slice(0, 6)}`
    const { barId } = await createPub({ bar: { name } })
    await page.goto(`/pub/${barId}`)
    await expect(page).toHaveURL(new RegExp(`/pub/${barId}$`))
    await expect(
      page.getByRole('heading', { level: 1, name: `${name} está no app.` })
    ).toBeVisible()
  })
})
