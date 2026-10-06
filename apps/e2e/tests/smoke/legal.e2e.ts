import { expect, test } from '../../fixtures/test'

// WEB-240: páginas públicas de termos e de privacidade. Sem sessão.

test('termos: título, índice, contato e ida para a política', async ({
  page
}) => {
  await page.goto('/termos')
  await expect(page).toHaveTitle('Termos de uso — Onside')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Termos de uso' })
  ).toBeVisible()

  const index = page.getByRole('navigation', { name: 'Seções' })
  await expect(index.getByRole('link')).toHaveCount(19)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quem pode usar' })
  ).toBeVisible()

  // Todo e-mail da Onside é o de contato.
  const main = page.getByRole('main')
  await expect(main).not.toContainText('privacidade@onside.sh')
  await expect(
    main.getByRole('link', { name: 'contato@onside.sh' }).first()
  ).toHaveAttribute('href', 'mailto:contato@onside.sh')

  // O cabeçalho é o da landing, apontando de volta para ela. Pelo seletor, e
  // não pelo papel: no celular essa navegação fica escondida atrás do menu.
  await expect(page.locator('header nav a[href="/#duvidas"]')).toHaveCount(1)

  await page.getByRole('link', { name: /Leia também/ }).click()
  await expect(page).toHaveURL(/\/privacidade$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidade' })
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Seções' }).getByRole('link')
  ).toHaveCount(17)
  await expect(page.getByRole('main')).not.toContainText(
    'privacidade@onside.sh'
  )
})

test('índice leva à seção e marca a seção em leitura', async ({ page }) => {
  await page.goto('/privacidade')
  const index = page.getByRole('navigation', { name: 'Seções' })
  const link = index.getByRole('link', { name: /Quais dados coletamos/ })
  await link.click()
  await expect(page).toHaveURL(/#s-4$/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quais dados coletamos?' })
  ).toBeInViewport()
})

test('rodapé da landing leva aos termos e à privacidade, e o sitemap os lista', async ({
  page
}) => {
  await page.goto('/')
  const footer = page.getByRole('contentinfo')
  await expect(
    footer.getByRole('link', { name: 'Privacidade' })
  ).toHaveAttribute('href', '/privacidade')
  await footer.getByRole('link', { name: 'Termos' }).click()
  await expect(page).toHaveURL(/\/termos$/)

  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/termos</loc>')
  expect(sitemap).toContain('/privacidade</loc>')
})
