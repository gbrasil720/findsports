import { randomUUID } from 'node:crypto'
import { storageState } from '../../fixtures/auth'
import { createEvent, days, hours, team } from '../../fixtures/fan'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// O link de um bar, `/pub/$pubId` (design 4x–4z): o web é só para bares, e a
// página do bar virou "O <bar> está no app", aberta sem sessão. Link sem bar
// (bar fora do ar, convite de amigo) cai na mesma página, sem o cartão
// (WEB-468).

const SEM_BAR = 'A Onside para torcedores está no app.'

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
  page,
  isMobile
}) => {
  const missing = await page.goto(`/pub/${randomUUID()}`)
  expect(missing?.status()).toBe(404)

  const name = `Bar Fechado ${randomUUID().slice(0, 6)}`
  const { barId } = await createPub({ bar: { name, is_active: false } })
  const offAir = await page.goto(`/pub/${barId}`)
  expect(offAir?.status()).toBe(200)
  // O nome do bar fora do ar não vaza no título da prévia de link.
  await expect(page).toHaveTitle('A Onside de torcedor está no app — Onside')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/
  )
  await expect(
    page.getByRole('heading', { level: 1, name: SEM_BAR })
  ).toBeVisible()
  await expect(page.getByText(name)).toHaveCount(0)
  if (isMobile) {
    // O app também não mostra o bar fora do ar: abre o app.
    await expect(
      page.getByRole('link', { name: 'Abrir no app' })
    ).toHaveAttribute('href', 'onside://')
  }
})

test('o convite de amigo é a página sem bar e abre o app no convite', async ({
  page,
  isMobile
}) => {
  // No celular a página tenta abrir o app sozinha. A ida ao `onside://` não
  // vira request: quem a vê é o protocolo do Chromium.
  const tentativas: string[] = []
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Page.enable')
  cdp.on('Page.frameRequestedNavigation', ({ url }) => {
    if (url.startsWith('onside://')) tentativas.push(url)
  })

  const response = await page.goto('/convite/GB-4821')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Convite de amigo — Onside')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/
  )
  await expect(
    page.getByRole('heading', { level: 1, name: SEM_BAR })
  ).toBeVisible()
  // A frase do convite fica no lugar da linha do computador e da do celular.
  await expect(
    page
      .getByText('Abra no app para aceitar o convite.')
      .filter({ visible: true })
  ).toHaveCount(1)

  if (isMobile) {
    await expect(
      page.getByRole('link', { name: 'Abrir no app' })
    ).toHaveAttribute('href', 'onside://convite/GB-4821')
    await expect.poll(() => tentativas).toEqual(['onside://convite/GB-4821'])
  } else {
    await expect(
      page.getByRole('img', { name: 'QR code: abre esta página no celular' })
    ).toBeVisible()
    expect(tentativas).toEqual([])
  }
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
