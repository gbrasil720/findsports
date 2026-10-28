import { signIn, storageState } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, type Role } from '../../fixtures/users'
import { loginWithForm } from './forms'

// WEB-175 — guarda central de navegação (`apps/web/src/utils/auth-guards.ts`).
// Matriz: deslogado, fan, pub, admin, onboarding pendente.

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
    '/admin',
    '/admin/billing',
    '/admin/validate',
    '/plan',
    '/plan/confirmed',
    '/app',
    // Pública só para quem acabou de se cadastrar na aba (WEB-349); esse
    // caminho está em `signup-login.e2e.ts` e `onboarding/pub.e2e.ts`.
    '/onboarding/pub'
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
    const { user } = await createPub()
    await loginWithForm(page, user, '/admin/jogos?ref=email')
    await expect(page).toHaveURL(/\/admin\/jogos\?ref=email$/)
  })

  // O painel do torcedor saiu do web: `/dashboard` é uma URL que não existe.
  test('/dashboard é 404', async ({ page }) => {
    const response = await page.goto('/dashboard')
    expect(response?.status()).toBe(404)
  })

  expectRedirect('/', '/')
  expectRedirect('/torcedor', '/torcedor')
})

/** Torcedor e admin no web vão à página do app; o bar, ao painel. */
const HOME: Record<Role, string> = {
  fan: '/torcedor',
  pub: '/admin',
  admin: '/torcedor'
}

for (const role of ['fan', 'pub', 'admin'] as const) {
  test.describe(`sessão de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    // Landing: fan e pub vão para casa; admin fica.
    expectRedirect('/', role === 'admin' ? '/' : HOME[role])
    expectRedirect('/?public=1', '/?public=1')
    // Start page do PWA.
    expectRedirect('/app', HOME[role])
    // Onboarding concluído (ou que não é do web) volta para casa.
    expectRedirect('/onboarding/fan', HOME[role])
    expectRedirect('/onboarding/pub', HOME[role])
    expectRedirect('/login', HOME[role])
  })
}

// WEB-473: o guard roda no SSR, onde a origem é a da requisição. Link
// absoluto do próprio site (e-mail, favorito) leva ao destino, não a /admin.
test.describe('bar logado com callbackUrl absoluto', () => {
  test.use({ storageState: storageState('pub') })

  test('/login segue para o destino de mesma origem', async ({
    page,
    baseURL
  }) => {
    const destino = new URL('/admin/jogos?ref=email', baseURL).href
    await page.goto(`/login?callbackUrl=${encodeURIComponent(destino)}`)
    await expect
      .poll(() => {
        const url = new URL(page.url())
        return url.pathname + url.search
      })
      .toBe('/admin/jogos?ref=email')
  })
})

test.describe('papel errado cai na casa certa', () => {
  for (const role of ['fan', 'admin'] as const) {
    test.describe(role, () => {
      test.use({ storageState: storageState(role) })
      expectRedirect('/admin', '/torcedor')
      expectRedirect('/admin/billing', '/torcedor')
      expectRedirect('/plan', '/torcedor')
    })
  }
})

test.describe('a página do app abre para o torcedor', () => {
  test.use({ storageState: storageState('fan') })

  test('fan', async ({ page }) => {
    await page.goto('/torcedor')
    await expect(
      page.getByRole('heading', { level: 1, name: /está no app/i })
    ).toBeVisible()
  })
})

test.describe('onboarding pendente', () => {
  test('bar vai para /onboarding/pub', async ({ page }) => {
    const user = await createUser({ role: 'pub', onboardingCompleted: false })
    await signIn(page, user)

    for (const path of ['/admin', '/', '/app']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/onboarding\/pub$/)
    }
  })

  // O onboarding do torcedor é só do app.
  test('torcedor vai para a página do app', async ({ page }) => {
    const user = await createUser({ role: 'fan', onboardingCompleted: false })
    await signIn(page, user)

    for (const path of ['/', '/app', '/onboarding/fan']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/torcedor$/)
    }
  })
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
