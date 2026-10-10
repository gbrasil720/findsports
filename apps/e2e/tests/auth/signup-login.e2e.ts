import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'
import {
  loginWithForm,
  submitSignup,
  uniqueEmail,
  VERIFICATION_SUBJECT
} from './forms'

// WEB-175 — cadastro e login. O cadastro é aberto: e-mail novo cria conta sem
// lista nem convite (WEB-232).

test('cadastro de torcedor valida a senha e cai em /verify-email', async ({
  page
}) => {
  const email = uniqueEmail('signup-fan')
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

  // Nome e e-mail já estão preenchidos. O campo perde o foco antes do clique:
  // no celular o erro de "Confirmar senha" só some no blur, e o botão sobe
  // 30px no meio do clique, que cai fora dele e não envia nada. É defeito do
  // formulário (erro de campo sem espaço reservado), anterior a este teste.
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  const confirm = page.getByLabel('Confirmar senha', { exact: true })
  await confirm.fill(DEFAULT_PASSWORD)
  await confirm.blur()
  await page.getByRole('button', { name: 'Entrar no time' }).click()

  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText(email)).toBeVisible()
  await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
})

test('cadastro de bar cai em /onboarding/pub sem sessão', async ({ page }) => {
  const email = uniqueEmail('signup-pub')
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

// WEB-232: é para onde a landing manda o bar.
test('/signup?role=pub abre com "Dono de Bar" marcado', async ({ page }) => {
  await page.goto('/signup?role=pub')

  await expect(
    page.getByRole('button', { name: 'Dono de Bar' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Torcedor' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await submitSignup(page, {
    name: 'Dono pela Landing',
    email: uniqueEmail('signup-role')
  })
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
})

// WEB-211: o destino vai no link do e-mail, que abre noutra aba — sem o
// `sessionStorage` da aba do cadastro — e atravessa o onboarding do torcedor.
test('cadastro pelo diálogo do bar volta para o bar depois da confirmação', async ({
  page,
  context
}) => {
  const { barId } = await createPub()
  const email = uniqueEmail('signup-bar')

  await page.goto(`/pub/${barId}`)
  await page.getByRole('link', { name: 'Criar conta grátis' }).click()
  await expect(page).toHaveURL(/\/signup\?callbackUrl=/)
  await submitSignup(page, { name: 'Torcedor do Bar', email })
  await expect(page).toHaveURL(/\/verify-email\?callbackUrl=/)

  const { link } = await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
  const tab = await context.newPage()
  await tab.goto(link)
  await expect(tab).toHaveURL(/\/onboarding\/fan\?callbackUrl=/)

  const button = (name: string) =>
    tab.getByRole('button', { name, exact: true })
  await button('Começar').click()
  await button('Futebol').click()
  await button('Continuar').click()
  await button('Pular').click()
  await button('Continuar').click()
  await button('Salvar e encontrar bares').click()

  await expect(tab).toHaveURL(new RegExp(`/pub/${barId}$`))
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
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
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
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })

  test('pelas configurações da conta', async ({ page }) => {
    const user = await createUser()
    await signIn(page, user)
    await page.goto('/dashboard/profile')
    await page.getByRole('tab', { name: 'Configurações' }).click()

    await page.getByRole('button', { name: 'Sair da conta' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
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
