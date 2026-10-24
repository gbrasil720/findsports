import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { DEFAULT_PASSWORD } from '../../fixtures/users'

// Telas e dados repetidos entre os specs de `tests/auth/`.

export const VERIFICATION_SUBJECT = 'Confirme seu e-mail para entrar em campo'

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${randomUUID()}@e2e.test`

/** Marca o aceite dos Termos e da Política, sem o qual o cadastro não envia. */
export async function acceptTerms(page: Page) {
  await page.getByRole('checkbox', { name: /Li e aceito os Termos/ }).check()
}

/** Preenche e envia o /signup já aberto (o cadastro do web é sempre de bar). */
export async function submitSignup(
  page: Page,
  { name, email }: { name: string; email: string }
) {
  await page.getByLabel('Seu nome').fill(name)
  await page.getByLabel('E-mail do responsável').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Criar conta do bar' }).click()
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
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

/** As configurações da conta do bar (o web não tem mais conta de torcedor). */
export async function openAccountSettings(page: Page) {
  await page.goto('/admin/configuracoes')
}
