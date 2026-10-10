import { randomUUID } from 'node:crypto'
import { storageState } from '../../fixtures/auth'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Painel /internal/bars (WEB-354). Só lê: usa a sessão pronta de admin. Quem
// não é admin não entra: `guard.e2e.ts` cobre a rota.

test.use({ storageState: storageState('admin') })

test('admin busca um bar e vê plano, situação e o link do Stripe', async ({
  page
}) => {
  const stripeId = `sub_e2e_${randomUUID()}`
  const active = await createPub({
    subscription: { plan: 'pro', externalSubscriptionId: stripeId }
  })
  const expired = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(-1)
    }
  })

  await page.goto('/internal/bars')
  const search = page.getByRole('textbox', { name: 'Buscar bar' })

  // Pelo e-mail do dono, que é o caminho do suporte.
  await search.fill(active.user.email)
  const row = page.getByRole('row').filter({ hasText: active.barId })
  await expect(row).toHaveCount(1)
  await expect(page.getByText('Exibindo 1 de 1 bares')).toBeVisible()
  await expect(row).toContainText('No ar')
  await expect(row).toContainText('Cadastro em')
  await expect(row).toContainText('Pro')
  await expect(row).toContainText('Em dia')
  await expect(row.getByRole('link', { name: stripeId })).toHaveAttribute(
    'href',
    `https://dashboard.stripe.com/test/subscriptions/${stripeId}`
  )

  // Pelo id: trial vencido não dá plano, por mais que a linha diga Elite.
  await search.fill(expired.barId)
  const expiredRow = page.getByRole('row').filter({ hasText: expired.barId })
  await expect(expiredRow).toHaveCount(1)
  await expect(row).toHaveCount(0)
  await expect(expiredRow).toContainText('Sem plano vigente')
  await expect(expiredRow).toContainText('Trial encerrado')
  await expect(expiredRow).toContainText('Elite · trialing')
  await expect(expiredRow).toContainText('Sem provedor')
})
