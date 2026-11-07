import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Me avise quando o app chegar" no perfil do torcedor (WEB-501): grava o
// e-mail da conta, sobrevive ao recarregar, "Não quero mais"
// marca a saída, e a falha de rede deixa "Tentar de novo".

const row = (userId: string) =>
  query<{ email: string; source: string; unsubscribed_at: Date | null }>(
    'SELECT email, source, unsubscribed_at FROM app_waitlist WHERE user_id = $1',
    [userId]
  )

test('entra na lista, recarrega e sai', async ({ page }) => {
  const fan = await createUser()
  await signIn(page, fan)
  const { email } = fan

  await page.goto('/dashboard/profile')
  const card = page.locator('.appc')
  await expect(card).toContainText('O app da Onside está chegando')
  await card.getByRole('button', { name: 'Me avise' }).click()

  await expect(card).toContainText('Combinado: avisamos quando o app chegar')
  await expect(card).toContainText(email)
  expect(await row(fan.id)).toEqual([
    { email, source: 'web', unsubscribed_at: null }
  ])

  await page.goto('/dashboard/profile')
  await expect(
    card.getByRole('button', { name: 'Não quero mais' })
  ).toBeVisible()
  await card.getByRole('button', { name: 'Não quero mais' }).click()
  await expect(card.getByRole('button', { name: 'Me avise' })).toBeVisible()
  const [saiu] = await row(fan.id)
  expect(saiu?.unsubscribed_at).toBeInstanceOf(Date)
})

test('falha de rede deixa "Tentar de novo"', async ({ page }) => {
  const fan = await createUser()
  await signIn(page, fan)
  await page.goto('/dashboard/profile')
  const card = page.locator('.appc')

  await page.route('**/api/trpc/appWaitlist.join**', (route) => route.abort())
  await card.getByRole('button', { name: 'Me avise' }).click()
  await expect(card.getByRole('alert')).toBeVisible()

  await page.unroute('**/api/trpc/appWaitlist.join**')
  await card.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(card).toContainText('Combinado: avisamos quando o app chegar')
  expect(await row(fan.id)).toHaveLength(1)
})
