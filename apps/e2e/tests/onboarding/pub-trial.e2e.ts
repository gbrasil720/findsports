import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { answerCookieConsent, expect, test } from '../../fixtures/test'
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
  await answerCookieConsent(fanContext)
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

// WEB-238 e WEB-501: a revisão diz o plano escolhido no cadastro, o bar nasce
// no teste dele (troca por `changeTrialPlan`) e o comprovante sai com R$ 0,00.
test('o plano escolhido no cadastro vira o do teste, com comprovante e /plan', async ({
  page
}) => {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  await page.goto('/onboarding/pub')
  const button = (name: string | RegExp) =>
    page.getByRole('button', { name, exact: typeof name === 'string' })

  await button('Começar').click()
  await page.getByLabel('Nome do estabelecimento').fill('Bar da Revisão')
  await page
    .getByLabel('Rua', { exact: true })
    .fill(`Rua da Revisão ${owner.id}`)
  await page.getByLabel('Número', { exact: true }).fill('1')
  await page.getByLabel('Bairro').fill('Pinheiros')
  await button('Continuar').click()
  await button('Pular').click()

  // Rotina: 12 jogos passam do limite do Starter, e o cardápio pede o Pro.
  await button(/cardápio/).click()
  await button('Ver a recomendação').click()
  await expect(
    page.getByRole('heading', { name: 'O Pro é o plano do Bar da Revisão' })
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked()
  await expect(
    page.getByText('Você passa 12 jogos por mês, e o Starter cadastra até 5')
  ).toBeVisible()
  // O dono escolhe outro: a recomendação não decide por ele.
  await page.getByText('Escolher o Starter').click()
  await expect(page.getByRole('radio', { name: 'Starter' })).toBeChecked()
  await button('Testar o Starter grátis').click()

  await expect(page.getByRole('heading', { name: 'Tudo certo?' })).toBeVisible()
  await expect(
    page.getByText(
      'Confira antes de colocar no ar. Ao continuar, salvamos o cadastro, seu bar entra no ar e o teste grátis do Starter começa: 120 dias, sem cartão.'
    )
  ).toBeVisible()
  await button('Colocar meu bar no ar').click()

  // Comprovante: o plano do servidor, nada cobrado hoje.
  const recibo = page.getByRole('document', { name: 'Comprovante de cadastro' })
  await expect(recibo.getByText('PLANO STARTER · TESTE')).toBeVisible()
  await expect(recibo.getByText('TOTAL HOJE')).toBeVisible()
  await expect(recibo.getByText('R$ 0,00')).toHaveCount(2)
  await expect(recibo.getByText('não pedido')).toBeVisible()
  const [bar] = await query<{
    is_active: boolean
    plan: string
    status: string
    external_subscription_id: string | null
  }>(
    `SELECT b.is_active, b.plan, s.status, s.external_subscription_id
     FROM bar b JOIN subscription s ON s.bar_id = b.id WHERE b.user_id = $1`,
    [owner.id]
  )
  expect(bar).toMatchObject({
    is_active: true,
    plan: 'starter',
    status: 'trialing',
    external_subscription_id: null
  })

  await button('Ver meu bar no ar').click()
  await expect(page).toHaveURL(/\/plan\?trial=started$/)
  const confirmacao = page.getByRole('dialog')
  await expect(
    confirmacao.getByRole('heading', {
      name: 'Seu bar está no ar com o Starter grátis.'
    })
  ).toBeVisible()
  await confirmacao.getByRole('button', { name: 'Ver os planos' }).click()
  await expect(page).toHaveURL(/\/plan$/)
  await expect(
    page.getByRole('heading', { name: /^Você está no trial do Starter até / })
  ).toBeVisible()
})
