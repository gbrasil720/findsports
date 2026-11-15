import { query } from '../../fixtures/db'
import { signInFanAt, uniqueSpot } from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Easter egg do Jules no Explorar (WEB-555) e a conquista secreta "Achou o
// Jules" (WEB-558): buscar "jules" sem jogo achado mostra o cartão no lugar de
// "Nenhum jogo perto"; com conta, grava a conquista; sem conta, ela vai junto
// com o "Me avise" da lista de espera do app.

const secreta = (userId: string) =>
  query<{ via: string }>(
    'SELECT via FROM secret_achievement WHERE user_id = $1 AND achievement_id = $2',
    [userId, 'jules']
  )

test('visitante acha o Jules, entra pelo Me avise e ganha a conquista', async ({
  page
}) => {
  await page.context().setGeolocation(uniqueSpot())
  const fan = await createUser({ role: 'fan' })

  await page.goto('/dashboard')
  await page.getByRole('searchbox').fill('  Jules ')
  const cartao = page.locator('.achou-jules:visible')
  await expect(cartao).toContainText('VOCÊ ACHOU O JULES')
  await expect(cartao).toContainText('Me achou.')
  await expect(page.getByText('Nenhum jogo perto')).toBeHidden()

  await cartao
    .getByRole('button', { name: 'Me avise quando o app chegar' })
    .click()
  const folha = page.getByRole('dialog')
  await folha.getByLabel('E-mail').fill(fan.email)
  await folha.getByLabel('Senha').fill(fan.password)
  await folha.getByRole('button', { name: /^Entrar/ }).click()

  await expect
    .poll(async () => (await secreta(fan.id)).map((r) => r.via))
    .toEqual(['web'])
  await expect
    .poll(
      async () =>
        (await query('SELECT 1 FROM app_waitlist WHERE user_id = $1', [fan.id]))
          .length
    )
    .toBe(1)
})

test('torcedor com conta acha o Jules e a conquista é gravada uma vez', async ({
  page
}) => {
  const fan = await signInFanAt(page, uniqueSpot())

  await page.goto('/dashboard')
  await page.getByRole('searchbox').fill('jules')
  await expect(page.locator('.achou-jules:visible')).toContainText('Me achou.')
  await expect(
    page.getByText(
      'Você destravou uma conquista secreta. Ela te espera no app.'
    )
  ).toBeVisible()
  await expect.poll(async () => (await secreta(fan.id)).length).toBe(1)

  // No perfil, a medalha aparece ganha.
  await page.goto('/dashboard/profile')
  await expect(page.getByText('Achou o Jules')).toBeVisible()
})
