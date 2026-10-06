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

test('rodapé: colunas do desenho, links de verdade, e o sitemap lista as páginas legais', async ({
  page
}) => {
  await page.goto('/')
  // Pela classe: as devtools do router também renderizam um <footer>.
  const footer = page.locator('footer.onside-site-footer')
  const nav = footer.getByRole('navigation', { name: 'Rodapé' })
  for (const [label, href] of [
    ['A Onside', '#produto'],
    ['Entrar', '/login'],
    ['Criar conta', '/signup'],
    ['Cadastre seu bar', '#bar-form'],
    ['Fale com a gente', 'mailto:contato@onside.sh'],
    ['Contato', 'mailto:contato@onside.sh'],
    ['Privacidade', '/privacidade']
  ] as const) {
    await expect(
      nav.getByRole('link', { name: label, exact: true })
    ).toHaveAttribute('href', href)
  }
  await expect(
    footer.getByRole('link', { name: /Quero a Onside na minha cidade/ })
  ).toHaveAttribute('href', '#lista')

  await nav.getByRole('link', { name: 'Termos', exact: true }).click()
  await expect(page).toHaveURL(/\/termos$/)
  // Fora da landing as âncoras voltam para ela.
  await expect(
    page
      .locator('footer.onside-site-footer')
      .getByRole('link', { name: 'Cadastre seu bar' })
  ).toHaveAttribute('href', '/#bar-form')

  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/termos</loc>')
  expect(sitemap).toContain('/privacidade</loc>')
})

test('formulários que coletam dado pessoal apontam para os documentos', async ({
  page
}) => {
  // Lista de espera, de torcedor e de bar: só a política.
  await page.goto('/')
  const naLanding = page.locator('.onside-legal-consent')
  await expect(naLanding).toHaveCount(2)
  await expect(naLanding.locator('a[href="/privacidade"]')).toHaveCount(2)
  await expect(naLanding.locator('a[href="/termos"]')).toHaveCount(0)

  // Cadastro cria conta: termos e política.
  await page.goto('/signup')
  const noCadastro = page.locator('.onside-legal-consent')
  await expect(noCadastro.locator('a[href="/termos"]')).toHaveCount(1)
  await expect(noCadastro.locator('a[href="/privacidade"]')).toHaveCount(1)
})
