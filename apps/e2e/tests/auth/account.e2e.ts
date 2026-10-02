import { randomUUID } from 'node:crypto'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import { openAccountSettings } from './forms'

// WEB-175 — configurações da conta: senha, sessões e exclusão.

const NEW_PASSWORD = 'senha-trocada-e2e-789'

test('trocar senha', async ({ page }) => {
  const user = await createUser()
  await signIn(page, user)
  await openAccountSettings(page)

  await page.getByRole('button', { name: 'Alterar senha' }).click()
  const dialog = page.getByRole('dialog', { name: 'Alterar senha' })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
  await dialog.getByLabel('Confirmar nova senha').fill('nao-confere-123')
  await dialog.getByRole('button', { name: 'Salvar nova senha' }).click()
  await expect(
    dialog.getByText('A confirmação não corresponde à nova senha.')
  ).toBeVisible()

  await dialog.getByLabel('Confirmar nova senha').fill(NEW_PASSWORD)
  await dialog.getByRole('button', { name: 'Salvar nova senha' }).click()

  await expect(
    page.getByText('Senha alterada. Os outros acessos foram encerrados.')
  ).toBeVisible()
  await expect(dialog).toBeHidden()
  const oldPassword = await page.request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(oldPassword.ok()).toBe(false)
  await signIn(page, { email: user.email, password: NEW_PASSWORD })
})

test('listar e revogar sessões: a revogada perde acesso em outro contexto', async ({
  page,
  browser,
  extraHTTPHeaders
}) => {
  const user = await createUser()
  await signIn(page, user)

  // Outro "dispositivo": contexto próprio, no mesmo IP aleatório do teste
  // (um IP fixo seria dividido com o mesmo teste no outro projeto).
  const other = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders
  })
  try {
    const otherPage = await other.newPage()
    await signIn(otherPage, user)
    await otherPage.goto('/dashboard')
    await expect(otherPage).toHaveURL(/\/dashboard$/)

    await openAccountSettings(page)
    const sessions = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Acessos ativos' }) })
    await expect(sessions.getByRole('article')).toHaveCount(2)
    await expect(sessions.getByText('Este dispositivo')).toHaveCount(1)

    await sessions
      .getByRole('button', { name: 'Encerrar', exact: true })
      .click()
    await expect(page.getByText('Acesso encerrado.')).toBeVisible()
    await expect(sessions.getByRole('article')).toHaveCount(1)

    await otherPage.goto('/dashboard')
    await expect(otherPage).toHaveURL(/\/login$/)
    // Quem revogou continua dentro.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    await other.close()
  }
})

test('excluir conta exige senha e a confirmação digitada', async ({ page }) => {
  const user = await createUser()
  await signIn(page, user)
  await openAccountSettings(page)

  await page.getByRole('button', { name: 'Excluir minha conta' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Excluir conta permanentemente'
  })
  const confirm = dialog.getByRole('button', {
    name: 'Excluir permanentemente'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('excluir minha conta')
  await expect(confirm).toBeDisabled()

  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('EXCLUIR MINHA CONTA')
  await confirm.click()

  await expect(page).toHaveURL(/\/(\?.*)?$/)
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)
})

test('bar com assinatura em curso não exclui a conta', async ({ page }) => {
  const { user } = await createPub({
    subscription: {
      status: 'active',
      dodoSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/admin#admin-configuracoes')

  await expect(
    page.getByText(
      'Encerre a assinatura vigente antes de excluir a conta do bar.'
    )
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Assinatura e pagamentos' }).last()
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Excluir minha conta' })
  ).toHaveCount(0)

  // O servidor recusa mesmo sem passar pela tela.
  const response = await page.request.post('/api/auth/delete-user', {
    data: { password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(response.status()).toBe(400)
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(1)
})
