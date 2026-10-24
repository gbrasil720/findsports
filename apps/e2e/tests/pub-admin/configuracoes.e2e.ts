import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { answerCookieConsent, expect, test } from '../../fixtures/test'
import { base32Decode, totp } from '../../fixtures/two-factor'

// Configurações do painel do bar (2e/2f): conta, segurança, avisos (em
// breve), privacidade e exclusão. A exclusão com assinatura está em
// `tests/auth/account.e2e.ts`.

async function open(page: Page) {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin/configuracoes')
  return pub
}

const secao = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

test('edita o nome do responsável', async ({ page }) => {
  const { user } = await open(page)
  const conta = secao(page, 'Conta e acesso')

  await expect(conta).toContainText(user.email)
  await expect(conta).toContainText('Somente leitura')
  await conta.getByRole('button', { name: 'Editar' }).click()
  await conta.getByLabel('Responsável').fill('Zé Carvalho')
  await conta.getByRole('button', { name: 'Salvar' }).click()

  await expect(conta).toContainText('Zé Carvalho')
  await expect(conta.getByRole('button', { name: 'Editar' })).toBeVisible()
  const [row] = await query('SELECT name FROM "user" WHERE id = $1', [user.id])
  expect(row?.name).toBe('Zé Carvalho')
})

test('troca a senha pelo diálogo', async ({ page }) => {
  const { user } = await open(page)

  await secao(page, 'Conta e acesso')
    .getByRole('button', { name: 'Alterar senha' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Alterar senha' })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog.getByLabel('Nova senha', { exact: true }).fill('outra-senha-123')
  await dialog.getByLabel('Confirmar nova senha').fill('outra-senha-123')
  await dialog.getByRole('button', { name: 'Salvar nova senha' }).click()

  await expect(
    page.getByText('Senha alterada. Os outros acessos foram encerrados.')
  ).toBeVisible()
  const old = await page.request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(old.ok()).toBe(false)
})

test('ativa a verificação em duas etapas', async ({ page }) => {
  const { user } = await open(page)
  const seguranca = secao(page, 'Segurança')

  await expect(seguranca).toContainText('Desativada')
  await seguranca.getByRole('button', { name: 'Ativar' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Ativar autenticação em dois fatores'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  const key = (await dialog.locator('code').textContent())?.trim() ?? ''
  await page
    .locator('#two-factor-code')
    .pressSequentially(totp(base32Decode(key)))
  await dialog
    .getByRole('checkbox', { name: 'Guardei meus códigos em um lugar seguro' })
    .check()
  await dialog.getByRole('button', { name: 'Concluir' }).click()

  await expect(seguranca).toContainText('Ativada')
  await expect(
    seguranca.getByRole('button', { name: 'Gerenciar' })
  ).toBeVisible()
  const [row] = await query(
    'SELECT two_factor_enabled FROM "user" WHERE id = $1',
    [user.id]
  )
  expect(row?.two_factor_enabled).toBe(true)
})

test('encerra a outra sessão, e ela perde o acesso', async ({
  page,
  browser,
  extraHTTPHeaders
}) => {
  const { user } = await open(page)
  const other = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders
  })
  await answerCookieConsent(other)
  try {
    const otherPage = await other.newPage()
    await signIn(otherPage, user)
    await page.reload()

    const seguranca = secao(page, 'Segurança')
    await expect(seguranca).toContainText('2 dispositivos')
    await expect(seguranca.getByText('Este navegador')).toHaveCount(1)
    await seguranca.getByRole('button', { name: /^Encerrar (?!todas)/ }).click()
    await expect(page.getByText('Acesso encerrado.')).toBeVisible()
    await expect(seguranca).toContainText('1 dispositivo')
    await expect(
      seguranca.getByRole('button', { name: 'Encerrar todas as outras' })
    ).toHaveCount(0)

    await otherPage.goto('/admin')
    await expect(otherPage).toHaveURL(/\/login\?callbackUrl=/)
  } finally {
    await other.close()
  }
})

test('avisos por e-mail ainda não existem: em breve, desligados', async ({
  page
}) => {
  await open(page)
  const avisos = secao(page, 'Avisos')
  await expect(avisos).toContainText('em breve')
  for (const name of ['Resumo semanal', 'Jogo lotando', 'Grade vazia']) {
    await expect(
      avisos.getByRole('switch', { name: new RegExp(name) })
    ).toBeDisabled()
  }
})

test('baixa um arquivo com os dados da conta e do bar', async ({ page }) => {
  const { user, barId } = await open(page)

  const download = page.waitForEvent('download')
  await secao(page, 'Privacidade')
    .getByRole('button', { name: 'Baixar arquivo' })
    .click()
  const file = await (await download).path()
  const data = JSON.parse(await readFile(file, 'utf8'))
  expect(data.profile.email).toBe(user.email)
  expect(data.bar.name).toBe(`Bar E2E ${barId.slice(0, 8)}`)
  expect(data.subscription.plan).toBe('elite')
})

test('excluir conta e bar pede senha e a frase', async ({ page }) => {
  const { user } = await open(page)

  await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Excluir conta permanentemente'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('EXCLUIR MINHA CONTA')
  await dialog.getByRole('button', { name: 'Excluir permanentemente' }).click()

  await expect(page.getByText('Sua conta foi excluída.')).toBeVisible()
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)
})
