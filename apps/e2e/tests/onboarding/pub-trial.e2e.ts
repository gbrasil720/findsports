import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-113: o teste grátis do cadastro, regra fixa desde o WEB-233.

test('o bar nasce publicado, com 120 dias de teste do Elite, e o torcedor o abre', async ({
  page,
  browser
}) => {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)

  const response = await page.request.post('/api/trpc/onboarding.completePub', {
    data: {
      name: 'Bar do Trial',
      neighborhood: 'Pinheiros',
      address: `Rua do Trial ${owner.id}, 1`
    }
  })
  expect(response.ok()).toBe(true)

  // O vencimento é conferido contra o relógio do banco, que foi quem o gravou.
  const [bar] = await query<{
    id: string
    is_active: boolean
    bar_plan: string
    plan: string
    status: string
    external_subscription_id: string | null
    vence_em_120_dias: boolean
  }>(
    `SELECT b.id, b.is_active, b.plan AS bar_plan, s.plan, s.status,
            s.external_subscription_id,
            s.current_period_end BETWEEN now() + interval '120 days' - interval '5 minutes'
                                     AND now() + interval '120 days' AS vence_em_120_dias
     FROM bar b LEFT JOIN subscription s ON s.bar_id = b.id
     WHERE b.user_id = $1`,
    [owner.id]
  )
  expect(bar).toMatchObject({
    is_active: true,
    // Projeção mantida pela trigger `subscription_bar_plan_sync`.
    bar_plan: 'elite',
    plan: 'elite',
    status: 'trialing',
    // Trial do cadastro: sem cartão e sem nada no Stripe (WEB-31).
    external_subscription_id: null,
    vence_em_120_dias: true
  })

  // O repro do ticket: antes, outra conta recebia "Bar não encontrado.".
  const fanContext = await browser.newContext({
    baseURL: BASE_URL,
    storageState: storageState('fan')
  })
  try {
    const fanPage = await fanContext.newPage()
    await fanPage.goto(`/pub/${bar?.id}`)
    await expect(
      fanPage.getByRole('heading', { name: 'Bar do Trial' })
    ).toBeVisible()
  } finally {
    await fanContext.close()
  }
})

// WEB-238: a revisão prometia só "escolher o plano".
test('a revisão avisa que o bar entra no ar com o plano grátis, e segue para /plan', async ({
  page
}) => {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  await page.goto('/onboarding/pub')

  await page.getByRole('button', { name: 'Começar', exact: true }).click()
  await page.getByLabel('Nome do estabelecimento').fill('Bar da Revisão')
  await page.getByLabel('Endereço').fill(`Rua da Revisão ${owner.id}, 1`)
  await page.getByLabel('Bairro').fill('Pinheiros')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Pular', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Pronto para colocar seu bar no ar' })
  ).toBeVisible()
  await expect(
    page.getByText(
      'Revise os dados do bar. Ao continuar, salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 120 dias, sem cartão. Em seguida você conhece os planos.'
    )
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Escolher meu plano' })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Colocar meu bar no ar' }).click()

  await expect(page).toHaveURL(/\/plan$/)
  await expect(
    page.getByRole('heading', { name: /^Você está no trial do Elite até / })
  ).toBeVisible()
  const [bar] = await query<{ is_active: boolean; plan: string }>(
    'SELECT is_active, plan FROM bar WHERE user_id = $1',
    [owner.id]
  )
  expect(bar).toMatchObject({ is_active: true, plan: 'elite' })
})
