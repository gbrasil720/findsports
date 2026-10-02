import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import {
  admittedAt,
  approveOnWaitlist,
  loginWithForm,
  submitSignup,
  uniqueEmail,
  VERIFICATION_SUBJECT
} from './forms'

// WEB-175 — cadastro e login. O portão da waitlist fica no padrão de produção
// (fechado) nestes testes; o caso "portão aberto" está em `gate.serial.e2e.ts`.

test('cadastro de torcedor valida a senha e cai em /verify-email', async ({
  page
}) => {
  const email = uniqueEmail('signup-fan')
  await approveOnWaitlist(email)
  await page.goto('/signup')

  // Alterna o papel e volta: só um fica marcado.
  const fan = page.getByRole('button', { name: 'Torcedor' })
  const pub = page.getByRole('button', { name: 'Dono de Bar' })
  await pub.click()
  await expect(pub).toHaveAttribute('aria-pressed', 'true')
  await expect(fan).toHaveAttribute('aria-pressed', 'false')
  await fan.click()
  await expect(fan).toHaveAttribute('aria-pressed', 'true')

  await page.getByLabel('Nome completo').fill('Torcedor E2E')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill('curta')
  await page.getByLabel('Confirmar senha', { exact: true }).fill('outra')
  await page.getByRole('button', { name: 'Entrar no time' }).click()
  await expect(
    page.getByText('A senha deve ter pelo menos 8 caracteres.')
  ).toBeVisible()
  await expect(page.getByText('As senhas não coincidem.')).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)

  await submitSignup(page, { name: 'Torcedor E2E', email })

  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText(email)).toBeVisible()
  await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
})

test('cadastro de bar cai em /onboarding/pub sem sessão', async ({ page }) => {
  const email = uniqueEmail('signup-pub')
  await approveOnWaitlist(email, 'pub')
  await page.goto('/signup')

  await page.getByRole('button', { name: 'Dono de Bar' }).click()
  await submitSignup(page, { name: 'Dono E2E', email })

  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  // `autoSignIn: false`: o cadastro não abre sessão antes da verificação.
  const session = await page.request.get('/api/auth/get-session')
  expect(await session.json()).toBeNull()
  const [user] = await query<{ role: string }>(
    'SELECT role FROM "user" WHERE email = $1',
    [email]
  )
  expect(user?.role).toBe('pub')
})

test.describe('portão da waitlist fechado', () => {
  test('cadastro sem waitlist aprovada é recusado e o aviso aparece', async ({
    page
  }) => {
    const email = uniqueEmail('signup-barrado')
    await page.goto('/signup')
    await expect(
      page.getByText('A Onside está abrindo por convite.')
    ).toBeVisible()

    const response = page.waitForResponse('**/api/auth/sign-up/email')
    await submitSignup(page, { name: 'Sem convite', email })

    const refused = await response
    expect(refused.status()).toBe(403)
    expect(await refused.json()).toMatchObject({
      code: 'WAITLIST_NOT_APPROVED'
    })
    await expect(page).toHaveURL(/\/signup$/)
    expect(
      await query('SELECT 1 FROM "user" WHERE email = $1', [email])
    ).toHaveLength(0)
  })

  test('cadastro com waitlist aprovada passa e grava admittedAt', async ({
    page
  }) => {
    const email = uniqueEmail('signup-aprovado')
    await approveOnWaitlist(email)
    await page.goto('/signup')

    await submitSignup(page, { name: 'Convidado', email })
    await expect(page).toHaveURL(/\/verify-email$/)
    expect(await admittedAt(email)).not.toBeNull()
  })
})

test('login com e-mail não verificado é recusado e reenvia a verificação', async ({
  page
}) => {
  const user = await createUser({ emailVerified: false })
  const response = page.waitForResponse('**/api/auth/sign-in/email')
  await loginWithForm(page, user)

  const refused = await response
  expect(refused.status()).toBe(403)
  expect(await refused.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
  await expect(page).toHaveURL(/\/login$/)

  const email = await lastEmailTo(user.email, { subject: VERIFICATION_SUBJECT })
  expect(email.link).toContain('/api/auth/verify-email?token=')
})

test('login com credenciais erradas mostra erro e fica no /login', async ({
  page
}) => {
  const user = await createUser()
  await loginWithForm(page, { ...user, password: 'senha-errada-123' })

  await expect(
    page.getByText('Credenciais inválidas. Verifique e tente novamente.')
  ).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('callbackUrl do login', () => {
  // WEB-182: o router entrega `href` relativo; o callback tem de sobreviver
  // nas duas formas, relativa (a do diálogo do bar) e absoluta de mesma origem.
  for (const callback of ['/dashboard/profile', 'BASE/dashboard/profile']) {
    test(`respeita callbackUrl de mesma origem: ${callback}`, async ({
      page,
      baseURL
    }) => {
      const user = await createUser()
      const url = callback.replace('BASE', baseURL ?? '')
      await loginWithForm(
        page,
        user,
        `/login?callbackUrl=${encodeURIComponent(url)}`
      )
      await expect(page).toHaveURL(/\/dashboard\/profile$/)
    })
  }

  // O caminho é o mesmo da mesma origem acima: se a checagem de origem sumir
  // e só o `pathname` for aproveitado, o login cai em `/dashboard/profile`.
  for (const callback of [
    'https://evil.example/dashboard/profile',
    '//evil.example/dashboard/profile'
  ]) {
    test(`ignora callbackUrl de outra origem: ${callback}`, async ({
      page
    }) => {
      const user = await createUser()
      await loginWithForm(
        page,
        user,
        `/login?callbackUrl=${encodeURIComponent(callback)}`
      )
      await expect(page).toHaveURL(/\/dashboard$/)
    })
  }
})

test.describe('logout', () => {
  test('pelo menu do shell do app', async ({ page }) => {
    const user = await createUser({ name: 'Saída Shell' })
    await signIn(page, user)
    await page.goto('/dashboard')

    await page
      .getByRole('button', { name: 'Menu da conta de Saída Shell' })
      .click()
    await page.getByRole('menuitem', { name: 'Sair' }).click()

    await expect(page).toHaveURL(/\/$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('pelo shell interno', async ({ page }) => {
    const admin = await createUser({ role: 'admin' })
    await signIn(page, admin)
    await page.goto('/internal')

    await page
      .getByRole('navigation', { name: 'Navegação interna' })
      .getByRole('button', { name: 'Sair' })
      .click()

    await expect(page).toHaveURL(/\/$/)
    await page.goto('/internal')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('pelas configurações da conta', async ({ page }) => {
    const user = await createUser()
    await signIn(page, user)
    await page.goto('/dashboard/profile')
    await page.getByRole('tab', { name: 'Configurações' }).click()

    await page.getByRole('button', { name: 'Sair da conta' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })
})

// WEB-189 — sem JS (ou antes de hidratar) o envio é nativo. Ele precisa ir por
// POST: um GET serializaria e-mail e senha na query string.
test.describe('envio antes da hidratação', () => {
  test.use({ javaScriptEnabled: false })

  test('/login não põe a senha na URL', async ({ context }) => {
    // `context.newPage()`, e não `page`: o `goto` do fixture espera uma
    // hidratação que sem JS nunca vem.
    const page = await context.newPage()
    const password = 'senha-que-nao-pode-vazar'
    await page.goto('/login')
    await page.getByLabel('E-mail').fill('pre-hidratacao@e2e.test')
    const senha = page.getByLabel('Senha', { exact: true })
    await senha.fill(password)

    // Enter, e não clique no botão: sem JS a animação de entrada do mobile
    // nunca assenta e o clique espera "estável" para sempre.
    const navigation = page.waitForRequest((r) => r.isNavigationRequest())
    await senha.press('Enter')
    const sent = await navigation
    const response = await sent.response()

    expect(sent.method()).toBe('POST')
    expect(sent.url()).not.toContain(password)
    expect(page.url()).not.toContain(password)
    expect(await response?.text()).not.toContain(password)
  })
})
