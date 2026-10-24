import { randomUUID } from 'node:crypto'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { deliverSubscription, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// WEB-175 — exclusão da conta do bar com assinatura. Senha, sessões, 2FA e a
// exclusão simples estão em `tests/pub-admin/configuracoes.e2e.ts`.

test('bar com assinatura em curso: a confirmação avisa do encerramento e do reembolso, e excluir encerra a assinatura no Stripe (WEB-336)', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const { user } = await createPub({
    subscription: { status: 'active', externalSubscriptionId: subscriptionId }
  })
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
  await page.goto('/admin/configuracoes')

  await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
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
  await page.goto('/admin/configuracoes')

  await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
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
  await page.goto('/admin/configuracoes')

  await expect(
    page.getByRole('button', { name: 'Excluir conta', exact: true })
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
