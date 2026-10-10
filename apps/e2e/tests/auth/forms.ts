import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { DEFAULT_PASSWORD } from '../../fixtures/users'

// Telas e dados repetidos entre os specs de `tests/auth/`.

export const VERIFICATION_SUBJECT = 'Confirme seu e-mail para entrar em campo'

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${randomUUID()}@e2e.test`

/** Marca o aceite dos Termos e da Política, sem o qual o cadastro não envia. */
export async function acceptTerms(page: Page) {
  await page
    .getByRole('checkbox', { name: /Declaro que li e concordo/ })
    .check()
}

/** Preenche e envia o /signup já aberto, com o papel que estiver marcado. */
export async function submitSignup(
  page: Page,
  { name, email }: { name: string; email: string }
) {
  await page.getByLabel('Nome completo').fill(name)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill(DEFAULT_PASSWORD)
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Entrar no time' }).click()
}

/** Login pela tela. Para só ter sessão, `signIn` de `fixtures/auth`. */
export async function loginWithForm(
  page: Page,
  user: { email: string; password: string },
  url = '/login'
) {
  await page.goto(url)
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Acessar minha conta' }).click()
}

export async function openAccountSettings(page: Page) {
  await page.goto('/dashboard/profile')
  await page.getByRole('tab', { name: 'Configurações' }).click()
}
