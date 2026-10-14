import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import { BASE_URL } from '../env'
import { query } from './db'
import { DEFAULT_PASSWORD, type Role } from './users'

/**
 * Contas de sessão pronta, criadas e logadas uma vez por rodada em
 * `tests/setup.setup.ts`. São compartilhadas por todos os testes em paralelo:
 * use só para LER. Teste que muda a própria conta (senha, papel, 2FA,
 * exclusão, onboarding) cria o usuário dele com `createUser` + `signIn`.
 *
 * O pub tem bar Elite ativo; fan e admin têm onboarding concluído.
 */
export const ROLE_USERS: Record<Role, { email: string; password: string }> = {
  fan: { email: 'fan@storage.e2e.test', password: DEFAULT_PASSWORD },
  pub: { email: 'pub@storage.e2e.test', password: DEFAULT_PASSWORD },
  admin: { email: 'admin@storage.e2e.test', password: DEFAULT_PASSWORD }
}

/** `test.use({ storageState: storageState('fan') })` no arquivo ou describe. */
export function storageState(role: Role): string {
  return fileURLToPath(new URL(`../.auth/${role}.json`, import.meta.url))
}

/**
 * Login pela API, sem tela: os cookies caem no contexto da página. Para testar
 * a tela de login em si, use o formulário.
 */
export async function signIn(
  page: Page,
  user: { email: string; password: string }
) {
  const response = await page.request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(response.ok(), await response.text()).toBe(true)
}

/**
 * WEB-383: ação de admin pede 2FA no servidor. Liga o 2FA de quem acabou de
 * entrar (antes do login, ele pediria o código) e renova o cookie cache, que
 * leva o usuário.
 */
export async function grantAdmin2fa(page: Page, email: string) {
  await query('UPDATE "user" SET two_factor_enabled = true WHERE email = $1', [
    email
  ])
  await page.request.get('/api/auth/get-session?disableCookieCache=true')
}
