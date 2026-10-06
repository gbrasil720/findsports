import { signIn } from '../../fixtures/auth'
import { query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-177. Serial porque grava `launch.pub_cities`, que é global.

test.afterEach(resetAppConfig)

test('cidade fora de launch.pub_cities é recusada na tela e no servidor', async ({
  page
}) => {
  await setAppConfig('launch.pub_cities', ['São Paulo', 'Rio de Janeiro'])
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  await page.goto('/onboarding/pub')

  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByLabel('Nome do estabelecimento').fill('Bar de Campinas')
  await page.getByLabel('Endereço').fill(`Rua Fechada ${owner.id}, 1`)
  await page.getByLabel('Bairro').fill('Cambuí')
  await page.getByLabel('Cidade', { exact: true }).fill('Campinas')

  const continuar = page.getByRole('button', { name: 'Continuar', exact: true })
  const aviso = page.getByRole('status').filter({ hasText: 'ainda não abriu' })
  await expect(aviso).toContainText('A Onside ainda não abriu em Campinas.')
  await expect(aviso).toContainText('São Paulo, Rio de Janeiro')
  await expect(continuar).toBeDisabled()

  // A comparação ignora acento e caixa.
  await page.getByLabel('Cidade', { exact: true }).fill('rio de janeiro')
  await expect(aviso).toHaveCount(0)
  await expect(continuar).toBeEnabled()

  // Quem recusa de verdade é o servidor, antes do geocoding.
  const response = await page.request.post('/api/trpc/onboarding.completePub', {
    data: {
      name: 'Bar de Campinas',
      neighborhood: 'Cambuí',
      city: 'Campinas',
      address: `Rua Fechada ${owner.id}, 1`
    }
  })
  expect(response.status()).toBe(412)
  expect(await response.text()).toContain(
    'A Onside ainda não abriu em Campinas'
  )
  expect(
    await query('SELECT 1 FROM bar WHERE user_id = $1', [owner.id])
  ).toHaveLength(0)
})
