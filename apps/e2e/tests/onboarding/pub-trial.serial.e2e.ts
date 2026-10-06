import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-113. Serial porque grava `billing.onboarding_trial`, que é global. O
// caso da chave desligada — bar nasce inativo — está em `pub.e2e.ts`.

test.afterEach(resetAppConfig)

test('com o trial ligado o bar nasce publicado, em Elite, e o torcedor o abre', async ({
  page,
  browser
}) => {
  await setAppConfig('billing.onboarding_trial', {
    enabled: true,
    plan: 'elite',
    days: 14
  })
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
    dodo_subscription_id: string | null
    vence_em_14_dias: boolean
  }>(
    `SELECT b.id, b.is_active, b.plan AS bar_plan, s.plan, s.status,
            s.dodo_subscription_id,
            s.current_period_end BETWEEN now() + interval '14 days' - interval '5 minutes'
                                     AND now() + interval '14 days' AS vence_em_14_dias
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
    dodo_subscription_id: null,
    vence_em_14_dias: true
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
