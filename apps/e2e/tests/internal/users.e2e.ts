import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, type TestUser } from '../../fixtures/users'

// Painel /internal/manage-users (WEB-181). Banir, trocar papel e impersonar
// mudam sessão e conta, então cada teste entra com um admin próprio e age
// sobre um usuário próprio — nunca sobre as sessões prontas do setup.

const uniqueName = (prefix: string) =>
  `${prefix} ${crypto.randomUUID().slice(0, 8)}`

async function openUser(page: Page, user: TestUser) {
  await page.goto('/internal/manage-users')
  await page.getByPlaceholder('Buscar por nome ou e-mail...').fill(user.email)
  const row = page.getByRole('row').filter({ hasText: user.email })
  await expect(row).toHaveCount(1)
  return row
}

async function openActions(page: Page, user: TestUser) {
  await page.getByRole('button', { name: `Ações de ${user.name}` }).click()
}

let admin: TestUser
test.beforeEach(async ({ page }) => {
  admin = await createUser({ role: 'admin', name: uniqueName('Admin') })
  await signIn(page, admin)
})

test('banir com motivo bloqueia o login; desbanir libera', async ({
  page,
  request
}) => {
  const target = await createUser({ name: uniqueName('Banível') })
  const signInTarget = () =>
    request.post('/api/auth/sign-in/email', {
      data: { email: target.email, password: target.password },
      headers: { origin: BASE_URL }
    })

  const row = await openUser(page, target)
  await expect(row).toContainText('Ativo')

  await openActions(page, target)
  await page.getByRole('menuitem', { name: 'Banir' }).click()
  const dialog = page.getByRole('dialog', { name: 'Banir usuário' })
  await expect(dialog).toContainText(target.email)
  await dialog.getByLabel('Motivo do banimento').fill('Spam em reservas')
  await dialog.getByRole('button', { name: 'Banir' }).click()

  await expect(page.getByText(`${target.name} foi banido.`)).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('Banido')
  await expect(row).toContainText('Spam em reservas')
  const banned = await signInTarget()
  expect(banned.ok()).toBe(false)
  expect(await banned.text()).toMatch(/banned/i)

  await openActions(page, target)
  await page.getByRole('menuitem', { name: 'Desbanir' }).click()
  await expect(page.getByText(`${target.name} foi desbanido.`)).toBeVisible()
  await expect(row).toContainText('Ativo')
  const unbanned = await signInTarget()
  expect(unbanned.ok(), await unbanned.text()).toBe(true)
})

test('cancelar o banimento não bane ninguém', async ({ page }) => {
  const target = await createUser({ name: uniqueName('Quase banido') })
  const row = await openUser(page, target)

  await openActions(page, target)
  await page.getByRole('menuitem', { name: 'Banir' }).click()
  const dialog = page.getByRole('dialog', { name: 'Banir usuário' })
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()

  await expect(row).toContainText('Ativo')
  const [user] = await query('SELECT banned FROM "user" WHERE id = $1', [
    target.id
  ])
  expect(user?.banned).not.toBe(true)
})

test('alterar o papel de torcedor para bar', async ({ page }) => {
  const target = await createUser({ name: uniqueName('Muda papel') })
  const row = await openUser(page, target)
  await expect(row).toContainText('Torcedor')

  await openActions(page, target)
  await page.getByRole('menuitem', { name: 'Alterar role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Alterar role' })
  const select = dialog.getByRole('combobox', { name: 'Novo role' })

  // Escolher admin avisa do acesso total antes de salvar.
  await select.click()
  await page.getByRole('option', { name: 'Admin' }).click()
  await expect(dialog).toContainText('acesso total ao painel admin')

  await select.click()
  await page.getByRole('option', { name: 'Bar' }).click()
  await dialog.getByRole('button', { name: 'Salvar' }).click()

  await expect(
    page.getByText(`Role de ${target.name} alterado para Bar.`)
  ).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('Bar')
  const [user] = await query('SELECT role FROM "user" WHERE id = $1', [
    target.id
  ])
  expect(user?.role).toBe('pub')
})

test('a própria linha do admin não tem ações', async ({ page }) => {
  const row = await openUser(page, admin)
  await expect(row).toContainText('Você')
  await expect(row.getByRole('button', { name: /^Ações de/ })).toHaveCount(0)
})

test('impersonar torcedor mostra o banner; encerrar volta ao painel', async ({
  page
}) => {
  const target = await createUser({ name: uniqueName('Torcedor alvo') })
  await openUser(page, target)

  await openActions(page, target)
  await page.getByRole('menuitem', { name: 'Impersonar' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'Modo de personificação ativo' })
  await expect(banner).toContainText(target.name)
  await expect(banner).toContainText(target.email)

  // A sessão é de fato a do alvo, não um rótulo por cima da do admin.
  const session = await page.request.get('/api/auth/get-session')
  expect((await session.json()).user.email).toBe(target.email)

  await banner.getByRole('button', { name: 'Encerrar sessão' }).click()
  await expect(page).toHaveURL(/\/internal\/manage-users$/)
  await expect(banner).toHaveCount(0)
  const back = await page.request.get('/api/auth/get-session')
  expect((await back.json()).user.role).toBe('admin')
})

test('impersonar dono de bar abre o painel do bar', async ({ page }) => {
  const { user: owner } = await createPub({
    user: { name: uniqueName('Dono alvo') }
  })
  await openUser(page, owner)

  await openActions(page, owner)
  await page.getByRole('menuitem', { name: 'Impersonar' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'Modo de personificação ativo' })
  await expect(banner).toContainText(owner.name)

  await banner.getByRole('button', { name: 'Encerrar sessão' }).click()
  await expect(page).toHaveURL(/\/internal\/manage-users$/)
  await expect(banner).toHaveCount(0)
})
