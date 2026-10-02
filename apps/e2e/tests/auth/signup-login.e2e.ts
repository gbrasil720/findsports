import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'

// WEB-175 — cadastro e login. O portão da waitlist fica no padrão de produção
// (fechado) nestes testes; o caso "portão aberto" está em `gate.serial.e2e.ts`.

const VERIFICATION_SUBJECT = 'Confirme seu e-mail para entrar em campo'

/** Inscrição confirmada e aprovada: o que o portão fechado exige no cadastro. */
async function approveOnWaitlist(email: string, role: 'fan' | 'pub' = 'fan') {
  await insert('waitlist_entries', {
    id: randomUUID(),
    email,
    role,
    city: 'São Paulo',
    confirmed_at: new Date(),
    approved_at: new Date()
  })
}

async function fillSignup(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string }
) {
  await page.getByLabel('Nome completo').fill(name)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByLabel('Confirmar senha', { exact: true }).fill(password)
}

const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID()}@e2e.test`

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

  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill(DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Entrar no time' }).click()

  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText(email)).toBeVisible()
  await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
})

test('cadastro de bar cai em /onboarding/pub sem sessão', async ({ page }) => {
  const email = uniqueEmail('signup-pub')
  await approveOnWaitlist(email, 'pub')
  await page.goto('/signup')

  await page.getByRole('button', { name: 'Dono de Bar' }).click()
  await fillSignup(page, {
    name: 'Dono E2E',
    email,
    password: DEFAULT_PASSWORD
  })
  await page.getByRole('button', { name: 'Entrar no time' }).click()

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

    await fillSignup(page, {
      name: 'Sem convite',
      email,
      password: DEFAULT_PASSWORD
    })
    const response = page.waitForResponse('**/api/auth/sign-up/email')
    await page.getByRole('button', { name: 'Entrar no time' }).click()

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

    await fillSignup(page, {
      name: 'Convidado',
      email,
      password: DEFAULT_PASSWORD
    })
    await page.getByRole('button', { name: 'Entrar no time' }).click()
    await expect(page).toHaveURL(/\/verify-email$/)

    const [user] = await query<{ admitted_at: Date | null }>(
      'SELECT admitted_at FROM "user" WHERE email = $1',
      [email]
    )
    expect(user?.admitted_at).not.toBeNull()
  })
})

test('login com e-mail não verificado é recusado e reenvia a verificação', async ({
  page
}) => {
  const user = await createUser({ emailVerified: false })
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)

  const response = page.waitForResponse('**/api/auth/sign-in/email')
  await page.getByRole('button', { name: 'Acessar minha conta' }).click()

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
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
  await page.getByRole('button', { name: 'Acessar minha conta' }).click()

  await expect(
    page.getByText('Credenciais inválidas. Verifique e tente novamente.')
  ).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('callbackUrl do login', () => {
  // WEB-182: `getCallbackUrl` recebe o `href` relativo do router, o
  // `new URL()` dele lança e todo callback vira `/dashboard`.
  test.fixme('respeita callbackUrl de mesma origem (WEB-182)', async ({
    page,
    baseURL
  }) => {
    const user = await createUser()
    await page.goto(
      `/login?callbackUrl=${encodeURIComponent(`${baseURL}/dashboard/profile`)}`
    )
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Acessar minha conta' }).click()
    await expect(page).toHaveURL(/\/dashboard\/profile$/)
  })

  test('ignora callbackUrl de outra origem', async ({ page }) => {
    const user = await createUser()
    await page.goto(
      `/login?callbackUrl=${encodeURIComponent('https://evil.example/roubo')}`
    )
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Acessar minha conta' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
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
