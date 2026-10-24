import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { seedTwoFactor, totp } from '../../fixtures/two-factor'
import { loginWithForm, openAccountSettings } from './forms'

// WEB-175 — autenticação em dois fatores: ativação, login e gestão.

const CHALLENGE_KEY = 'onside:two-factor-challenge'

/** Digita o código no campo de 6 dígitos (input-otp: um input só, oculto). */
async function typeCode(page: Page, id: string, code: string) {
  await page.locator(`#${id}`).pressSequentially(code)
}

/** O web é do bar: as contas destes testes são de bar. */
const pubUser = async () => (await createPub()).user

test.describe('login com 2FA', () => {
  test('código TOTP', async ({ page }) => {
    const user = await pubUser()
    const { secret } = await seedTwoFactor(user.id)

    await loginWithForm(page, user)
    await expect(page).toHaveURL(/\/two-factor$/)
    await typeCode(page, 'two-factor-login-code', totp(secret))
    await page.getByRole('button', { name: 'Confirmar e entrar' }).click()

    await expect(page).toHaveURL(/\/admin$/)
  })

  test('código errado mostra erro e não entra', async ({ page }) => {
    const user = await pubUser()
    const { secret } = await seedTwoFactor(user.id)

    await loginWithForm(page, user)
    await expect(page).toHaveURL(/\/two-factor$/)
    const wrong = String((Number(totp(secret)) + 1) % 1_000_000).padStart(
      6,
      '0'
    )
    await typeCode(page, 'two-factor-login-code', wrong)
    await page.getByRole('button', { name: 'Confirmar e entrar' }).click()

    await expect(page.locator('#two-factor-login-code-error')).not.toBeEmpty()
    await expect(page).toHaveURL(/\/two-factor$/)
  })

  test('código de recuperação', async ({ page }) => {
    const user = await pubUser()
    const { backupCodes } = await seedTwoFactor(user.id)

    await loginWithForm(page, user)
    await expect(page).toHaveURL(/\/two-factor$/)
    await page.getByRole('button', { name: 'Recuperação' }).click()
    await page.getByLabel('Código de recuperação').fill(backupCodes[0] ?? '')
    await page.getByRole('button', { name: 'Confirmar e entrar' }).click()

    await expect(page).toHaveURL(/\/admin$/)
  })

  test('"confiar neste dispositivo" pula o código no login seguinte', async ({
    page
  }) => {
    const user = await pubUser()
    const { secret } = await seedTwoFactor(user.id)

    await loginWithForm(page, user)
    await expect(page).toHaveURL(/\/two-factor$/)
    await typeCode(page, 'two-factor-login-code', totp(secret))
    await page
      .getByRole('checkbox', { name: 'Confiar neste dispositivo por 30 dias' })
      .check()
    await page.getByRole('button', { name: 'Confirmar e entrar' }).click()
    await expect(page).toHaveURL(/\/admin$/)

    // Sai só da sessão: o cookie de dispositivo confiável fica no contexto.
    // `data: {}` e a conferência do status: sem corpo JSON o better-auth
    // responde 415 e a sessão ficava aberta — o teste passava sem nunca ter
    // saído, e o `/login` de quem já tem sessão agora redireciona (WEB-278).
    const signOut = await page.request.post('/api/auth/sign-out', {
      data: {},
      headers: { origin: BASE_URL }
    })
    expect(signOut.status(), await signOut.text()).toBe(200)
    await loginWithForm(page, user)
    await expect(page).toHaveURL(/\/admin$/)
  })
})

test.describe('/two-factor sem desafio válido volta para /login', () => {
  test('sem desafio', async ({ page }) => {
    await page.goto('/two-factor')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('desafio com mais de 10 minutos', async ({ page }) => {
    await page.addInitScript(
      ([key, startedAt]) => {
        sessionStorage.setItem(
          key as string,
          JSON.stringify({ callbackUrl: '/admin', startedAt })
        )
      },
      [CHALLENGE_KEY, Date.now() - 11 * 60 * 1000] as const
    )
    await page.goto('/two-factor')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test('regenerar códigos e desativar 2FA', async ({ page }) => {
  const user = await pubUser()
  // Entra antes de ligar o 2FA: com ele ligado o login pede o código.
  await signIn(page, user)
  const { backupCodes } = await seedTwoFactor(user.id)
  await openAccountSettings(page)

  const seguranca = page.getByRole('region', { name: 'Segurança', exact: true })
  await expect(seguranca).toContainText('Ativada')
  await seguranca.getByRole('button', { name: 'Gerenciar' }).click()
  const manage = page.getByRole('dialog', {
    name: 'Gerenciar códigos de recuperação'
  })
  await manage.getByLabel('Senha atual').fill(user.password)
  await manage.getByRole('button', { name: 'Gerar novos códigos' }).click()

  const codes = manage.getByRole('listitem')
  await expect(codes).toHaveCount(10)
  const fresh = await codes.allTextContents()
  expect(fresh).not.toContain(backupCodes[0])
  await manage
    .getByRole('checkbox', { name: 'Guardei meus códigos em um lugar seguro' })
    .check()
  await manage.getByRole('button', { name: 'Concluir' }).click()
  await expect(manage).toBeHidden()

  await seguranca.getByRole('button', { name: 'Gerenciar' }).click()
  await manage
    .getByRole('button', { name: 'Desativar autenticação em dois fatores' })
    .click()
  const disable = page.getByRole('dialog', { name: 'Desativar 2FA' })
  await disable.getByLabel('Senha atual').fill(user.password)
  await disable.getByRole('button', { name: 'Desativar 2FA' }).click()

  await expect(
    page.getByText('Autenticação em dois fatores desativada.')
  ).toBeVisible()
  await expect(seguranca).toContainText('Desativada')
  const [row] = await query<{ two_factor_enabled: boolean }>(
    'SELECT two_factor_enabled FROM "user" WHERE id = $1',
    [user.id]
  )
  expect(row?.two_factor_enabled).toBe(false)
})
