import { storageState } from '../../fixtures/auth'
import { query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createWaitlistEntry, uniqueTag } from './waitlist-entries'

// Portão de cadastro e aviso de abertura no painel da waitlist (WEB-181).
// Serial: o portão é `launch.waitlist_gate` em `app_config`, global, e o aviso
// vai para todo inscrito elegível do banco, não só os deste teste.

test.use({ storageState: storageState('admin') })
test.afterEach(resetAppConfig)

const gateValue = async () =>
  (
    await query<{ value: unknown }>(
      "SELECT value FROM app_config WHERE key = 'launch.waitlist_gate'"
    )
  )[0]?.value

test('abrir o cadastro pede confirmação e grava o portão', async ({ page }) => {
  await page.goto('/internal/waitlist')
  const access = page.getByRole('region', { name: 'Acesso' })
  await expect(access).toContainText('Fechado')

  // Recusar a confirmação não muda nada.
  page.once('dialog', (dialog) => dialog.dismiss())
  await access.getByRole('switch', { name: 'Cadastro: fechado' }).click()
  await expect(access).toContainText('Fechado')
  expect(await gateValue()).toBeUndefined()

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('abrir o cadastro')
    void dialog.accept()
  })
  await access.getByRole('switch', { name: 'Cadastro: fechado' }).click()
  await expect(
    access.getByRole('switch', { name: 'Cadastro: aberto' })
  ).toBeVisible()
  expect(await gateValue()).toEqual({ signup: false })
  await expect(access).toContainText('Última alteração')

  page.once('dialog', (dialog) => void dialog.accept())
  await access.getByRole('switch', { name: 'Cadastro: aberto' }).click()
  await expect(
    access.getByRole('switch', { name: 'Cadastro: fechado' })
  ).toBeVisible()
  expect(await gateValue()).toEqual({ signup: true })
})

test('aviso de abertura só sai com o cadastro aberto', async ({ page }) => {
  const entry = await createWaitlistEntry(uniqueTag('wl-aviso'))
  const access = () => page.getByRole('region', { name: 'Acesso' })
  const send = () =>
    access().getByRole('button', { name: 'Enviar aviso de abertura' })

  await page.goto('/internal/waitlist')
  await expect(send()).toBeDisabled()
  await expect(access()).toContainText('Abra o cadastro antes de enviar')

  await setAppConfig('launch.waitlist_gate', { signup: false })
  await page.reload()
  await expect(send()).toBeEnabled()

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/Enviar o aviso genérico para \d+/)
    void dialog.accept()
  })
  await send().click()
  await expect(page.getByText(/enviados? · 0 falharam\./)).toBeVisible()

  const notice = await lastEmailTo(entry.email, {
    subject: 'A Onside está aberta'
  })
  expect(notice.link).toContain('/signup?source=waitlist_launch')
  const [row] = await query(
    'SELECT launch_notice_sent_at FROM waitlist_entries WHERE id = $1',
    [entry.id]
  )
  expect(row?.launch_notice_sent_at).not.toBeNull()
})
