import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'
import {
  acceptTerms,
  loginWithForm,
  submitSignup,
  uniqueEmail,
  VERIFICATION_SUBJECT
} from './forms'

// WEB-175 — cadastro e login. O cadastro é aberto: e-mail novo cria conta sem
// lista nem convite (WEB-232).

test('cadastro de bar valida a senha e cai em /onboarding/pub', async ({
  page
}) => {
  const email = uniqueEmail('signup-pub')
  await page.goto('/signup')

  // Sem escolha de perfil: o cadastro do web é sempre de bar.
  await expect(page.getByRole('button', { name: 'Torcedor' })).toHaveCount(0)

  // Sem o aceite dos Termos e da Política o botão não envia. O aceite vem
  // antes dos campos: marcado depois de um campo inválido, o blur mostra o
  // erro, o formulário desce no meio do clique e o clique se perde.
  const enviar = page.getByRole('button', { name: 'Criar conta do bar' })
  await expect(enviar).toBeDisabled()
  await acceptTerms(page)
  await expect(enviar).toBeEnabled()

  await page.getByLabel('Seu nome').fill('Dono E2E')
  await page.getByLabel('E-mail do responsável').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill('curta')
  await enviar.click()
  await expect(
    page.getByText('A senha deve ter pelo menos 8 caracteres.')
  ).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)

  // O clique vem direto do campo corrigido, sem blur: o erro some enquanto a
  // pessoa digita, então o botão não sobe no meio do clique.
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await expect(
    page.getByText('A senha deve ter pelo menos 8 caracteres.')
  ).toBeHidden()
  await enviar.click()

  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  // `autoSignIn: false`: o cadastro não abre sessão antes da verificação.
  const session = await page.request.get('/api/auth/get-session')
  expect(await session.json()).toBeNull()
  const [user] = await query<{ role: string }>(
    'SELECT role FROM "user" WHERE email = $1',
    [email]
  )
  expect(user?.role).toBe('pub')
  await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
})

// WEB-232: os links antigos da landing e do guia levam `?role=pub`.
test('/signup?role=pub segue abrindo o cadastro do bar', async ({ page }) => {
  await page.goto('/signup?role=pub')
  await submitSignup(page, {
    name: 'Dono pela Landing',
    email: uniqueEmail('signup-role')
  })
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
})

test('o card "É torcedor?" leva à página do app', async ({ page }) => {
  for (const path of ['/login', '/signup']) {
    await page.goto(path)
    await page.getByRole('link', { name: /É torcedor\?/ }).click()
    await expect(page).toHaveURL(/\/torcedor$/)
  }
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
  // A tela de confirmação, com o e-mail, em vez de "sem permissão".
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText(user.email)).toBeVisible()

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
  // nas duas formas, relativa e absoluta de mesma origem.
  for (const callback of ['/admin/jogos', 'BASE/admin/jogos']) {
    test(`respeita callbackUrl de mesma origem: ${callback}`, async ({
      page,
      baseURL
    }) => {
      const { user } = await createPub()
      const url = callback.replace('BASE', baseURL ?? '')
      await loginWithForm(
        page,
        user,
        `/login?callbackUrl=${encodeURIComponent(url)}`
      )
      await expect(page).toHaveURL(/\/admin\/jogos$/)
    })
  }

  // O caminho é o mesmo da mesma origem acima: se a checagem de origem sumir
  // e só o `pathname` for aproveitado, o login cai em `/admin/jogos`.
  for (const callback of [
    'https://evil.example/admin/jogos',
    '//evil.example/admin/jogos'
  ]) {
    test(`ignora callbackUrl de outra origem: ${callback}`, async ({
      page
    }) => {
      const { user } = await createPub()
      await loginWithForm(
        page,
        user,
        `/login?callbackUrl=${encodeURIComponent(callback)}`
      )
      await expect(page).toHaveURL(/\/admin$/)
    })
  }

  test('torcedor que entra pela tela vai à página do app', async ({ page }) => {
    await loginWithForm(page, await createUser())
    await expect(page).toHaveURL(/\/torcedor$/)
  })
})

test.describe('logout', () => {
  test('pelo menu do painel', async ({ page }) => {
    const { user } = await createPub({ user: { name: 'Saída Painel' } })
    await signIn(page, user)
    await page.goto('/admin')

    await page
      .getByRole('button', { name: 'Menu da conta de Saída Painel' })
      .click()
    await page.getByRole('menuitem', { name: 'Sair' }).click()

    await expect(page).toHaveURL(/\/$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })

  test('pelas configurações da conta', async ({ page }) => {
    const { user } = await createPub()
    await signIn(page, user)
    await page.goto('/admin/configuracoes')

    await page.getByRole('button', { name: 'Sair da conta' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/admin')
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
