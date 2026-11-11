import { randomUUID } from 'node:crypto'
import { storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent, days } from '../../fixtures/fan'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Bares do Houdini (antes /internal/bars, WEB-354). Só lê: usa a sessão
// pronta de admin. Quem não é admin não entra: `guard.e2e.ts` cobre o portão.

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

  await page.goto('/houdini/bares')
  const search = page.getByLabel('Buscar bar')
  const panel = page.getByRole('complementary', { name: 'Bar escolhido' })

  // Pelo e-mail do dono, que é o caminho do suporte.
  await search.fill(active.user.email)
  const row = page.getByRole('row').filter({ hasText: active.user.email })
  await expect(row).toHaveCount(1)
  // O cabeçalho e a linha do bar: a busca não traz outro.
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(row).toContainText('no ar')
  await expect(row).toContainText('Pro · em dia')
  await expect(row).toContainText('pro · active')
  await expect(panel).toContainText(active.barId)
  await expect(
    panel.getByRole('link', { name: 'Abrir no Stripe' })
  ).toHaveAttribute(
    'href',
    `https://dashboard.stripe.com/test/subscriptions/${stripeId}`
  )

  // Pelo id: teste vencido não dá plano, por mais que a linha diga Elite.
  await search.fill(expired.barId)
  const expiredRow = page
    .getByRole('row')
    .filter({ hasText: expired.user.email })
  await expect(expiredRow).toHaveCount(1)
  await expect(row).toHaveCount(0)
  await expect(expiredRow).toContainText('Sem plano · Trial encerrado')
  await expect(expiredRow).toContainText('sem assinatura')
  await expect(panel).toContainText(expired.barId)
  await expect(
    panel.getByRole('link', { name: 'Abrir no Stripe' })
  ).toHaveCount(0)
})

test('ficha: rascunho aparece marcado em Jogos e fica fora das contagens', async ({
  page
}) => {
  const pub = await createPub()
  await createEvent({
    barId: pub.barId,
    startsAt: days(2),
    freeText: 'Publicado E2E x Rival'
  })
  const draft = await createEvent({
    barId: pub.barId,
    startsAt: days(1),
    freeText: 'Rascunho E2E x Rival'
  })
  await query('UPDATE event SET published_at = NULL WHERE id = $1', [draft])

  await page.goto(`/houdini/bares/${pub.barId}`)
  await expect(page.getByRole('tab', { name: 'Jogos' })).toHaveText('Jogos1')
  const proximos = page.locator('section', {
    has: page.getByRole('heading', { name: 'Próximos jogos' })
  })
  await expect(proximos).toContainText('Publicado E2E x Rival')
  await expect(proximos).not.toContainText('Rascunho E2E x Rival')

  await page.getByRole('tab', { name: 'Jogos' }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel).toContainText('Publicado E2E x Rival')
  await expect(panel).toContainText('Rascunho E2E x RivalRascunho')
})
