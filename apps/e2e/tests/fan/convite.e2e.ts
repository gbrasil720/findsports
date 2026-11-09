import { expect, test } from '../../fixtures/test'

// O link de convite dos amigos do app, `/convite/$code` (WEB-468): a página
// de entrada que no celular tenta abrir o app no convite e, no computador,
// mostra o QR.

test('o convite de amigo abre o app no celular e mostra o QR no computador', async ({
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
    page.getByRole('heading', { level: 1, name: 'Te chamaram pra Onside' })
  ).toBeVisible()
  await expect(
    page
      .getByText('Abra no app para aceitar o convite.')
      .filter({ visible: true })
  ).toHaveCount(1)
  await expect(
    page.getByRole('link', { name: 'Abrir no app' })
  ).toHaveAttribute('href', 'onside://convite/GB-4821')

  if (isMobile) {
    await expect.poll(() => tentativas).toEqual(['onside://convite/GB-4821'])
  } else {
    await expect(
      page.getByRole('img', { name: 'QR code: abre esta página no celular' })
    ).toBeVisible()
    expect(tentativas).toEqual([])
  }
})
