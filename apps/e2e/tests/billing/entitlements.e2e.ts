import { signIn } from '../../fixtures/auth'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Recurso pago só vale com `active`, ou `trialing` com período no futuro
// (`getCurrentPlan`). Cardápio é recurso Pro: a tela e o servidor concordam.

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

const updateMenu = (page: import('@playwright/test').Page) =>
  page.request.post('/api/trpc/pub.updateMenuInfo', {
    data: { averageSpendCents: 5000 }
  })

const cases: {
  name: string
  subscription: PubOptions['subscription']
  allowed: boolean
}[] = [
  {
    name: 'ativo',
    subscription: { plan: 'pro', status: 'active' },
    allowed: true
  },
  {
    name: 'trial vigente',
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(10)
    },
    allowed: true
  },
  {
    name: 'trial vencido',
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(-1)
    },
    allowed: false
  }
]

for (const { name, subscription, allowed } of cases) {
  test(`Pro ${name}: cardápio ${allowed ? 'liberado' : 'bloqueado'}`, async ({
    page
  }) => {
    const { user } = await createPub({ subscription })
    await signIn(page, user)
    await page.goto('/admin#admin-espaco')

    const field = page.getByLabel('Link do cardápio (opcional)')
    if (allowed) {
      await expect(field).toBeVisible()
    } else {
      await expect(page.getByText('Trial do plano Pro encerrado')).toBeVisible()
      await expect(field).toHaveCount(0)
    }

    const response = await updateMenu(page)
    expect(response.status(), await response.text()).toBe(allowed ? 200 : 403)
  })
}
