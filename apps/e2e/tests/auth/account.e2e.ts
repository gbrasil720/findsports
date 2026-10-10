import { randomUUID } from 'node:crypto'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { deliverSubscription, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import { approveOnWaitlist, openAccountSettings } from './forms'

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
    await expect(otherPage).toHaveURL(/\/login\?callbackUrl=/)
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
  // WEB-348: sem aviso, a home deslogada não distinguia exclusão de sessão caída.
  await expect(page.getByText('Sua conta foi excluída.')).toBeVisible()
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)

  await page.reload()
  await expect(page.getByText('Sua conta foi excluída.')).toHaveCount(0)
})

test('bar com assinatura em curso: a confirmação avisa do encerramento e do reembolso, e excluir encerra a assinatura no Stripe (WEB-336)', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const { user } = await createPub({
    subscription: { status: 'active', externalSubscriptionId: subscriptionId }
  })
  // WEB-342: a inscrição da waitlist com o e-mail da conta sai junto.
  await approveOnWaitlist(user.email, 'pub')
  const subscription = stripeSubscription({
    id: subscriptionId,
    status: 'active',
    plan: 'elite',
    userId: user.id
  })
  const seeded = await request.post(`${STUB_URL}/stripe/subscriptions`, {
    data: subscription
  })
  expect(seeded.ok()).toBe(true)
  await signIn(page, user)
  await page.goto('/admin#admin-configuracoes')

  await page.getByRole('button', { name: 'Excluir minha conta' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Excluir conta permanentemente'
  })
  await expect(
    dialog.getByText(
      'Sua assinatura será encerrada agora. O valor já pago do período em curso não é devolvido, e o crédito em conta, se houver, se perde.'
    )
  ).toBeVisible()
  await expect(
    dialog.getByText(
      'Se a sua primeira contratação foi feita há até 7 dias, você tem direito ao reembolso integral: peça ao suporte em contato@onside.sh.'
    )
  ).toBeVisible()

  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('EXCLUIR MINHA CONTA')
  await dialog.getByRole('button', { name: 'Excluir permanentemente' }).click()

  await expect(page.getByText('Sua conta foi excluída.')).toBeVisible()
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)
  expect(
    await query('SELECT 1 FROM waitlist_entries WHERE email = $1', [user.email])
  ).toHaveLength(0)
  const calls = (await (
    await request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { method: string; path: string }[]
  expect(
    calls.filter(
      (call) =>
        call.method === 'DELETE' &&
        call.path === `/subscriptions/${subscriptionId}`
    )
  ).toHaveLength(1)

  // O aviso de encerramento chega depois, sem bar para achar: 200, sem reenvio.
  const webhook = await deliverSubscription(
    request,
    'customer.subscription.deleted',
    { ...subscription, status: 'canceled' }
  )
  expect(webhook.status(), await webhook.text()).toBe(200)
})

test('Stripe recusa encerrar a assinatura: a conta fica e o dono lê que pode tentar de novo', async ({
  page
}) => {
  // Assinatura que o stub não conhece: o "Stripe" responde 404.
  const { user } = await createPub({
    subscription: {
      status: 'active',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/admin#admin-configuracoes')

  await page.getByRole('button', { name: 'Excluir minha conta' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Excluir conta permanentemente'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('EXCLUIR MINHA CONTA')
  await dialog.getByRole('button', { name: 'Excluir permanentemente' }).click()

  await expect(
    dialog.getByText(
      'Não foi possível encerrar a assinatura agora, e a conta não foi excluída. Tente de novo em instantes.'
    )
  ).toBeVisible()
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(1)
})

test('bar que cancelou exclui a conta, mesmo com o período pago no futuro (WEB-60)', async ({
  page
}) => {
  // Cancelamento imediato: o Stripe encerra na hora e o período fica no
  // futuro. Não há mais o que cobrar, então nada segura a exclusão.
  const { user } = await createPub({
    subscription: {
      status: 'cancelled',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    },
    bar: { is_active: false }
  })
  await signIn(page, user)
  await page.goto('/admin#admin-configuracoes')

  await expect(
    page.getByRole('button', { name: 'Excluir minha conta' })
  ).toBeEnabled()

  const response = await page.request.post('/api/auth/delete-user', {
    data: { password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(response.ok(), await response.text()).toBe(true)
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)
})
