import { existsSync } from 'node:fs'
import { type Page, webkit } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// WEB-135: a caixa alta da Onside sai da fonte (`--caixa: "ss20"`), não de
// `text-transform`, que o Chrome e o Safari entregam transformado ao leitor
// de tela ("título VALIDAR CÓDIGO"). O nome acessível é o texto do código.

/** Papel e nome de cada nó da árvore de acessibilidade do Chromium. */
async function nativeTree(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  return nodes.flatMap((node) =>
    node.role?.value && node.name?.value
      ? [`${node.role.value} ${node.name.value}`]
      : []
  )
}

/** Cada nome existe na árvore como está no código, e não em maiúsculas. */
async function expectNames(page: Page, names: string[]) {
  await page.evaluate('document.fonts.ready')
  const tree = await nativeTree(page)
  for (const name of names) {
    expect(tree, name).toContain(name)
    const [role, ...rest] = name.split(' ')
    expect(tree).not.toContain(`${role} ${rest.join(' ').toUpperCase()}`)
  }
}

test('landing e login: nome acessível com a caixa do código', async ({
  page
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Tudo isso seguindo apenas três' })
  ).toBeAttached()
  await expectNames(page, [
    'heading Tudo isso seguindo apenas três passos simples.'
  ])

  await page.goto('/login')
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible()
  await expectNames(page, ['textbox E-mail', 'textbox Senha'])
})

test('painel: títulos com a caixa do código', async ({ page }) => {
  const { user } = await createPub({ subscription: { plan: 'elite' } })
  await signIn(page, user)

  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: 'Hoje na casa' })
  ).toBeVisible()
  await expectNames(page, ['heading Hoje na casa'])

  await page.goto('/admin/validate')
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  await expectNames(page, ['heading Validar código', 'textbox Código'])
})

// O Playwright não lê a árvore nativa do WebKit. O que ela mostra é o texto
// renderizado, o mesmo do `innerText`: com `text-transform` ele vem em
// maiúsculas. Só roda onde o WebKit do Playwright está instalado (o CI só
// instala o Chromium); o Safari de verdade foi conferido pelo Inspetor de
// Acessibilidade (PR do WEB-135).
test('WebKit: texto renderizado com a caixa do código', async ({
  baseURL
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'uma vez basta')
  test.skip(!existsSync(webkit.executablePath()), 'WebKit não instalado')
  const browser = await webkit.launch()
  try {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toBeVisible()
    await page.evaluate('document.fonts.ready')
    expect(await title.innerText()).toMatch(/^Bem-vindo\s*de volta$/)
    await expect(title).toHaveCSS('font-feature-settings', /ss20/)
  } finally {
    await browser.close()
  }
})
