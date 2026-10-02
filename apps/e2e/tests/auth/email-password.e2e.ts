import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'

// WEB-175 — verificação de e-mail, esqueci a senha e redefinição.

const VERIFICATION_SUBJECT = 'Confirme seu e-mail para entrar em campo'
const RESET_SUBJECT = 'Redefina a senha da sua conta Onside'
const NEW_PASSWORD = 'senha-nova-e2e-456'

/** Cadastro de torcedor pelo formulário, com convite aprovado (portão fechado). */
async function signupFan(page: Page) {
  const email = `verify-${randomUUID()}@e2e.test`
  await insert('waitlist_entries', {
    id: randomUUID(),
    email,
    role: 'fan',
    city: 'São Paulo',
    confirmed_at: new Date(),
    approved_at: new Date()
  })
  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('Verificação E2E')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill(DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Entrar no time' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  return email
}

test.describe('verificação de e-mail', () => {
  test('link do e-mail confirma e leva o torcedor novo ao onboarding', async ({
    page
  }) => {
    const email = await signupFan(page)
    const { link } = await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })

    await page.goto(link)

    await expect(page).toHaveURL(/\/onboarding\/fan$/)
    const [user] = await query<{ email_verified: boolean }>(
      'SELECT email_verified FROM "user" WHERE email = $1',
      [email]
    )
    expect(user?.email_verified).toBe(true)
  })

  test('link do e-mail passa por /verify-email?confirmed=1 e cai na casa do papel', async ({
    page
  }) => {
    const user = await createUser({ emailVerified: false })
    const sent = await page.request.post('/api/auth/send-verification-email', {
      data: { email: user.email, callbackURL: '/verify-email?confirmed=1' },
      headers: { origin: BASE_URL }
    })
    expect(sent.ok()).toBe(true)
    const { link } = await lastEmailTo(user.email, {
      subject: VERIFICATION_SUBJECT
    })

    const visited: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url())
    })
    await page.goto(link)

    await expect(page).toHaveURL(/\/dashboard$/)
    expect(
      visited.some((url) => url.includes('/verify-email?confirmed=1'))
    ).toBe(true)
  })

  test('reenviar link manda um e-mail novo', async ({ page }) => {
    const email = await signupFan(page)
    const first = await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })

    await page.getByRole('button', { name: 'Reenviar link' }).click()

    await expect(
      page.getByText(
        'Se o endereço estiver cadastrado, um novo link foi enviado.'
      )
    ).toBeVisible()
    // O token é um JWT com `iat` em segundos: reenviar no mesmo segundo gera
    // o mesmo link. O que distingue o e-mail novo é o horário de envio.
    await expect
      .poll(async () => (await lastEmailTo(email)).sentAt)
      .not.toBe(first.sentAt)
  })
})

test('esqueci a senha responde igual para e-mail existente e inexistente', async ({
  page
}) => {
  const user = await createUser()
  const ghost = `fantasma-${randomUUID()}@e2e.test`
  const replies: unknown[] = []

  for (const email of [user.email, ghost]) {
    await page.goto('/forgot-password')
    await page.getByLabel('E-mail da conta').fill(email)
    const response = page.waitForResponse('**/api/auth/request-password-reset')
    await page
      .getByRole('button', { name: 'Enviar link de recuperação' })
      .click()
    const reply = await response
    replies.push({ status: reply.status(), body: await reply.json() })

    await expect(
      page.getByRole('heading', { name: /CONFIRA SUA CAIXA DE ENTRADA/ })
    ).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  }

  expect(replies[1]).toEqual(replies[0])
  await lastEmailTo(user.email, { subject: RESET_SUBJECT })
})

test.describe('redefinir senha', () => {
  async function requestReset(page: Page, email: string) {
    await page.goto('/forgot-password')
    await page.getByLabel('E-mail da conta').fill(email)
    await page
      .getByRole('button', { name: 'Enviar link de recuperação' })
      .click()
    await expect(
      page.getByRole('heading', { name: /CONFIRA SUA CAIXA DE ENTRADA/ })
    ).toBeVisible()
    return (await lastEmailTo(email, { subject: RESET_SUBJECT })).link
  }

  const invalidLink = (page: Page) =>
    expect(
      page.getByRole('heading', { name: /ESSE LINK NÃO VALE MAIS/ })
    ).toBeVisible()

  test('sucesso derruba todas as sessões, cai no /login e o link não vale de novo', async ({
    page
  }) => {
    const user = await createUser()
    await signIn(page, user)
    const sessionsBefore = await query(
      'SELECT 1 FROM session WHERE user_id = $1',
      [user.id]
    )
    expect(sessionsBefore.length).toBeGreaterThan(0)

    const link = await requestReset(page, user.email)
    await page.goto(link)
    await expect(page).toHaveURL(/\/reset-password\?token=/)
    await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await page
      .getByLabel('Confirmar nova senha', { exact: true })
      .fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()

    await expect(page).toHaveURL(/\/login$/)
    expect(
      await query('SELECT 1 FROM session WHERE user_id = $1', [user.id])
    ).toHaveLength(0)
    await signIn(page, { email: user.email, password: NEW_PASSWORD })

    // Já usado: mesma tela de link inválido.
    await page.goto(link)
    await invalidLink(page)
  })

  test('link expirado mostra a tela de link inválido', async ({ page }) => {
    const user = await createUser()
    const link = await requestReset(page, user.email)
    const token = new URL(link).pathname.split('/').at(-1)
    await query(
      `UPDATE verification SET expires_at = now() - interval '1 minute'
       WHERE identifier = $1`,
      [`reset-password:${token}`]
    )

    await page.goto(link)
    await invalidLink(page)
  })

  test('link inválido mostra a mesma tela', async ({ page }) => {
    await page.goto(
      '/api/auth/reset-password/token-que-nao-existe?callbackURL=%2Freset-password'
    )
    await invalidLink(page)

    // Token na URL que o servidor recusa só no envio: vira a mesma tela.
    await page.goto('/reset-password?token=token-que-nao-existe')
    await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await page
      .getByLabel('Confirmar nova senha', { exact: true })
      .fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await invalidLink(page)
  })
})
