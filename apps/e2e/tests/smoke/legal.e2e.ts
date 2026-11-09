import type { Page } from '@playwright/test'
import { expect, test } from '../../fixtures/test'

// WEB-240: páginas públicas de termos e de privacidade. Sem sessão.

// No celular o índice é uma pílula presa no alto: a lista abre pelo botão.
// `toPass`: o clique antes da hidratação não abre nada, e o teste tenta de novo.
async function openIndex(page: Page, isMobile: boolean) {
  const toggle = page.locator('.lg-index-toggle')
  if (isMobile) {
    await expect(async () => {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click()
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
        timeout: 1000
      })
    }).toPass()
  }
  return page.getByRole('navigation', { name: 'Seções' })
}

test('termos: título, índice, contato e ida para a política', async ({
  page,
  isMobile
}) => {
  await page.goto('/termos')
  await expect(page).toHaveTitle('Termos de uso — Onside')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Termos de uso' })
  ).toBeVisible()

  const index = await openIndex(page, isMobile)
  await expect(index.getByRole('link')).toHaveCount(19)
  if (isMobile) await page.locator('.lg-index-toggle').click()
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
  await expect((await openIndex(page, isMobile)).getByRole('link')).toHaveCount(
    17
  )
  await expect(page.getByRole('main')).not.toContainText(
    'privacidade@onside.sh'
  )
})

test('índice leva à seção e marca a seção em leitura', async ({
  page,
  isMobile
}) => {
  await page.goto('/privacidade')
  const index = await openIndex(page, isMobile)
  const link = index.getByRole('link', { name: /Quais dados coletamos/ })
  await link.click()
  await expect(page).toHaveURL(/#s-4$/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quais dados coletamos?' })
  ).toBeInViewport()
})

test('rodapé: colunas do desenho, links de verdade, e o sitemap lista as páginas legais', async ({
  page,
  isMobile
}) => {
  await page.goto('/')
  // Landing v3 (WEB-501): rodapé próprio. Pela classe: as devtools do router
  // também renderizam um <footer>.
  const nav = page
    .locator('.lp3 footer.foot')
    .getByRole('navigation', { name: 'Rodapé' })
  // No celular a coluna "Conta" sai: entrar e criar conta já estão na barra
  // fixa e no botão do topo.
  const account = isMobile
    ? []
    : ([
        ['Entrar', '/login'],
        ['Criar conta', '/signup']
      ] as const)
  for (const [label, href] of [
    ...account,
    ['Cadastre seu bar', '/signup?role=pub'],
    ['Contato', 'mailto:contato@onside.sh'],
    ['Termos', '/termos'],
    ['Privacidade', '/privacidade'],
    ['Instagram', 'https://www.instagram.com/onside.sh/'],
    ['X', 'https://x.com/onside_sh'],
    ['TikTok', 'https://www.tiktok.com/@onside.sh']
  ] as const) {
    await expect(
      nav.getByRole('link', { name: label, exact: true })
    ).toHaveAttribute('href', href)
  }

  await nav.getByRole('link', { name: 'Termos', exact: true }).click()
  await expect(page).toHaveURL(/\/termos$/)
  // Fora da landing as âncoras voltam para ela.
  await expect(
    page
      .locator('.lp3 footer.foot')
      .getByRole('link', { name: 'A Onside', exact: true })
  ).toHaveAttribute('href', '/#produto')

  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/termos</loc>')
  expect(sitemap).toContain('/privacidade</loc>')
})

test('formulário que coleta dado pessoal aponta para os documentos', async ({
  page
}) => {
  // A landing não coleta mais nada: quem coleta é o cadastro.
  await page.goto('/')
  await expect(page.locator('.entrada-aceite')).toHaveCount(0)

  // Cadastro cria conta: termos e política.
  await page.goto('/signup')
  const noCadastro = page.locator('.entrada-aceite')
  await expect(noCadastro.locator('a[href="/termos"]')).toHaveCount(1)
  await expect(noCadastro.locator('a[href="/privacidade"]')).toHaveCount(1)
})
