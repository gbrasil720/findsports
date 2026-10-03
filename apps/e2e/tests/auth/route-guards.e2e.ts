import { signIn, storageState } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, type Role } from '../../fixtures/users'
import { loginWithForm } from './forms'

// WEB-175 — guarda central de navegação (`apps/web/src/utils/auth-guards.ts`).
// Matriz: deslogado, fan, pub, admin, não admitido, onboarding pendente.

/** Abre `from` e espera terminar em `to` (caminho + query, sem o hash). */
function expectRedirect(from: string, to: string) {
  test(`${from} → ${to}`, async ({ page }) => {
    await page.goto(from)
    await expect
      .poll(() => {
        const url = new URL(page.url())
        return url.pathname + url.search
      })
      .toBe(to)
  })
}

test.describe('deslogado', () => {
  for (const path of [
    '/dashboard',
    '/dashboard/profile',
    '/dashboard/reservations',
    '/admin',
    '/admin/billing',
    '/admin/validate',
    '/plan',
    '/plan/confirmed',
    '/internal',
    '/internal/waitlist',
    '/app',
    '/onboarding/fan'
  ]) {
    // WEB-210: o destino original vai junto como callbackUrl.
    test(`${path} → /login com callbackUrl`, async ({ page }) => {
      await page.goto(path)
      await expect
        .poll(() => {
          const url = new URL(page.url())
          return [url.pathname, url.searchParams.get('callbackUrl')]
        })
        .toEqual(['/login', path])
    })
  }

  test('link direto protegido volta ao destino depois do login', async ({
    page
  }) => {
    // `loginWithForm` abre o link protegido; o guard leva ao formulário.
    await loginWithForm(
      page,
      await createUser(),
      '/dashboard/profile?ref=email'
    )
    await expect(page).toHaveURL(/\/dashboard\/profile\?ref=email$/)
  })

  test('/onboarding/pub abre sem sessão', async ({ page }) => {
    await page.goto('/onboarding/pub')
    await expect(page).toHaveURL(/\/onboarding\/pub$/)
  })

  test('/pub/$pubId abre sem sessão', async ({ page }) => {
    const { barId } = await createPub()
    await page.goto(`/pub/${barId}`)
    await expect(page).toHaveURL(new RegExp(`/pub/${barId}$`))
    await expect(
      page.getByRole('dialog', { name: 'Autenticação obrigatória' })
    ).toBeVisible()
  })

  expectRedirect('/', '/')
})

const HOME: Record<Role, string> = {
  fan: '/dashboard',
  pub: '/admin',
  admin: '/internal'
}

for (const role of ['fan', 'pub', 'admin'] as const) {
  test.describe(`sessão de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    // Landing: fan e pub vão para casa; admin fica.
    expectRedirect('/', role === 'admin' ? '/' : HOME[role])
    expectRedirect('/?public=1', '/?public=1')
    // Start page do PWA.
    expectRedirect('/app', HOME[role])
    // Concluído no onboarding volta para casa (pub vai escolher plano). Admin
    // passa por /dashboard e de lá vai para /internal.
    expectRedirect('/onboarding/fan', role === 'pub' ? '/plan' : HOME[role])
    expectRedirect('/onboarding/pub', role === 'pub' ? '/plan' : HOME[role])
    // Admitido em /access-pending sai.
    expectRedirect('/access-pending', HOME[role])
  })
}

test.describe('"Ver a landing" do menu não redireciona', () => {
  test.use({ storageState: storageState('fan') })

  test('fan', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /^Menu da conta de / }).click()
    await page.getByRole('menuitem', { name: 'Ver a landing' }).click()

    await expect(page).toHaveURL(/\/\?public=/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/\?public=/)
  })
})

test.describe('papel errado cai na casa certa', () => {
  test.describe('fan', () => {
    test.use({ storageState: storageState('fan') })
    expectRedirect('/admin', '/dashboard')
    expectRedirect('/admin/billing', '/dashboard')
    expectRedirect('/internal', '/dashboard')
    expectRedirect('/internal/flags', '/dashboard')
    expectRedirect('/plan', '/dashboard')
  })

  test.describe('pub', () => {
    test.use({ storageState: storageState('pub') })
    expectRedirect('/dashboard', '/admin')
    expectRedirect('/dashboard/profile', '/admin')
    expectRedirect('/internal', '/admin')
  })

  test.describe('admin', () => {
    test.use({ storageState: storageState('admin') })
    expectRedirect('/dashboard', '/internal')
    expectRedirect('/dashboard/reservations', '/internal')
    // /plan manda para /dashboard, que manda admin para /internal.
    expectRedirect('/plan', '/internal')
  })
})

test.describe('não admitido vai para /access-pending', () => {
  for (const role of ['fan', 'pub'] as const) {
    test(role, async ({ page }) => {
      const user =
        role === 'pub'
          ? (await createPub({ user: { admitted: false } })).user
          : await createUser({ admitted: false })
      await signIn(page, user)

      for (const path of [HOME[role], '/', '/app', `/onboarding/${role}`]) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/access-pending$/)
      }
    })
  }

  test('admin não admitido entra mesmo assim', async ({ page }) => {
    const admin = await createUser({ role: 'admin', admitted: false })
    await signIn(page, admin)
    await page.goto('/internal')
    await expect(page).toHaveURL(/\/internal$/)
  })
})

test.describe('onboarding pendente força /onboarding/{papel}', () => {
  for (const role of ['fan', 'pub'] as const) {
    test(role, async ({ page }) => {
      const user = await createUser({ role, onboardingCompleted: false })
      await signIn(page, user)

      for (const path of [HOME[role], '/', '/app', '/access-pending']) {
        await page.goto(path)
        await expect(page).toHaveURL(new RegExp(`/onboarding/${role}$`))
      }
    })
  }
})

test('rota inexistente renderiza 404 com noindex', async ({ page }) => {
  const response = await page.goto('/rota-que-nao-existe-e2e')
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: /saiu de campo/ })
  ).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/
  )
})
