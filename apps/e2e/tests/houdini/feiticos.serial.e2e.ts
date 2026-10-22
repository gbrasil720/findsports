import type { Page } from '@playwright/test'
import { signIn, storageState } from '../../fixtures/auth'
import { query, resetAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Feitiços do Houdini (antes /internal/flags, WEB-181). Serial: grava
// `app_config`, global.

test.use({ storageState: storageState('admin') })
test.afterEach(resetAppConfig)

const KEY = 'rating.public_display'

function spell(page: Page, key: string) {
  return page
    .locator('article')
    .filter({ has: page.locator('code', { hasText: key }) })
}

/** Abre a linha do feitiço (descrição, JSON e "Voltar ao padrão"). */
async function openSpell(page: Page, key: string) {
  const row = spell(page, key)
  await row.getByRole('button', { name: key, exact: true }).click()
  await expect(row.getByText('Editar como JSON')).toBeVisible()
  return row
}

/**
 * A linha gravada e quantos minutos faltam para ela se desfazer. A conta é do
 * banco: `expires_at` é `timestamp` sem fuso, em UTC, e o `pg` o leria no fuso
 * de quem roda o teste.
 */
async function stored(key: string) {
  const [row] = await query<{ value: unknown; minutes_left: number | null }>(
    `SELECT value,
            round(extract(epoch FROM expires_at - (now() AT TIME ZONE 'UTC')) / 60)::int
              AS minutes_left
     FROM app_config WHERE key = $1`,
    [key]
  )
  return row
}

/** O que um visitante lê das chaves públicas, sem cache no E2E. */
async function publicConfig(page: Page) {
  const response = await page.request.get('/api/trpc/appConfig.getPublic')
  expect(response.ok()).toBe(true)
  return JSON.stringify(await response.json())
}

test('interruptor lança na hora, por 1 h, e volta ao padrão', async ({
  page
}) => {
  await page.goto('/houdini/feiticos')
  const row = spell(page, KEY)
  const toggle = row.getByRole('switch', { name: KEY })

  await expect(row.getByText('no padrão', { exact: true })).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  await toggle.click()
  await expect(page.getByText(`${KEY} lançado por 1 h.`)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(row.getByText('lançado', { exact: true })).toBeVisible()
  await expect(row).toContainText('volta em')
  const after = await stored(KEY)
  expect(after?.value).toBe(true)
  expect(after?.minutes_left).toBe(60)
  expect(await publicConfig(page)).toContain(`"${KEY}":true`)

  await openSpell(page, KEY)
  await row.getByRole('button', { name: 'Voltar ao padrão' }).click()
  await expect(page.getByText(`${KEY} voltou ao padrão.`)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(row.getByText('no padrão', { exact: true })).toBeVisible()
  expect(await stored(KEY)).toBeUndefined()
})

// WEB-387: o prazo escolhido vai para o banco; "Sem prazo" não expira.
test('o prazo escolhido vale para o feitiço lançado', async ({ page }) => {
  await page.goto('/houdini/feiticos')
  const prazo = page.getByRole('group', { name: 'Prazo do feitiço' })
  const toggle = spell(page, KEY).getByRole('switch', { name: KEY })

  await prazo.getByRole('button', { name: '15 min' }).click()
  await toggle.click()
  await expect(page.getByText(`${KEY} lançado por 15 min.`)).toBeVisible()
  await expect(spell(page, KEY)).toContainText('volta em 15 min')
  // O interruptor inverte o valor da tela: só depois da recarga.
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect((await stored(KEY))?.minutes_left).toBe(15)

  await prazo.getByRole('button', { name: 'Sem prazo' }).click()
  await toggle.click()
  await expect(page.getByText(`${KEY} lançado.`)).toBeVisible()
  await expect(spell(page, KEY)).not.toContainText('volta em')
  const after = await stored(KEY)
  expect(after?.value).toBe(false)
  expect(after?.minutes_left).toBeNull()
})

test('JSON inválido e valor fora do formato não gravam; o motivo aparece', async ({
  page
}) => {
  await page.goto('/houdini/feiticos')
  const row = await openSpell(page, KEY)
  await row.getByText('Editar como JSON').click()
  const field = row.getByLabel(`Valor de ${KEY} em JSON`)
  const save = row.getByRole('button', { name: 'Lançar este valor' })

  await field.fill('verdadeiro')
  await save.click()
  await expect(row.getByRole('alert')).toHaveText(/JSON inválido/)

  // JSON válido, mas a chave é booleana: quem recusa é o servidor (WEB-346).
  await field.fill('"sim"')
  await save.click()
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]')
  ).toContainText(
    'Valor recusado — Entrada inválida: esperava um valor booleano, recebeu um texto'
  )
  await expect(row.getByText('no padrão', { exact: true })).toBeVisible()
  expect(await stored(KEY)).toBeUndefined()

  await field.fill('true')
  await save.click()
  await expect(page.getByText(`${KEY} lançado por 1 h.`)).toBeVisible()
  expect((await stored(KEY))?.value).toBe(true)
  // O nome da conta de admin do setup (`createUser`), não o id dela.
  await expect(row).toContainText('por E2E admin')
})

test('alteração de conta que não existe mais não mostra o id', async ({
  page
}) => {
  await query(
    `INSERT INTO app_config (key, value, updated_by) VALUES ($1, 'true'::jsonb, 'conta-apagada')`,
    [KEY]
  )
  await page.goto('/houdini/feiticos')
  const row = await openSpell(page, KEY)
  await expect(row).toContainText('mudou em')
  await expect(row).not.toContainText('conta-apagada')
})

/** Um valor válido e diferente do atual, do mesmo formato. */
function anotherValue(value: unknown): unknown {
  if (typeof value === 'boolean') return !value
  // Pesos dos testes de IA (WEB-424): troca a ordem dos braços do chat.
  if (
    value !== null &&
    typeof value === 'object' &&
    'chat' in value &&
    'recommender' in value
  ) {
    const weights = value as {
      chat: { a: number; b: number }
      recommender: Record<string, number>
    }
    return {
      ...weights,
      chat: {
        a: weights.chat.b,
        b: weights.chat.a === weights.chat.b ? 0 : weights.chat.a
      }
    }
  }
  throw new Error(`Formato sem valor alternativo: ${JSON.stringify(value)}`)
}

test('todo feitiço edita como JSON, lança e volta ao padrão', async ({
  page
}) => {
  // WEB-233: linha de chave que saiu do registro (cobrança, cidades do
  // cadastro de bar) pode seguir gravada até a migration de limpeza, e não
  // vira feitiço.
  for (const retired of [
    'billing.checkout_enabled',
    'billing.onboarding_trial',
    'billing.founder_coupon',
    'launch.pub_cities'
  ]) {
    await query(
      `INSERT INTO app_config (key, value) VALUES ($1, 'true'::jsonb)`,
      [retired]
    )
  }
  await page.goto('/houdini/feiticos')
  // No mobile os toasts empilham no rodapé por cima da última linha, que não
  // tem como rolar para fora deles. Os toasts seguem visíveis para as
  // asserções, só deixam o clique passar.
  await page.addStyleTag({
    content:
      '[data-sonner-toaster], [data-sonner-toaster] * { pointer-events: none !important; }'
  })
  // `allTextContents` não espera: só lê depois que as linhas renderizaram.
  await expect(spell(page, KEY)).toBeVisible()
  // O padrão de um feitiço em JSON também sai em `<code>`: só os nomes contam.
  const keys = (await page.locator('article code').allTextContents()).filter(
    (text) => /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(text)
  )
  // Só as chaves do registro, nenhuma a mais; chave nova entra aqui.
  expect([...keys].sort()).toEqual([
    'ai.enabled',
    'ai.variant_weights',
    'rating.public_display',
    'search.tiered_plan_query'
  ])

  for (const key of keys) {
    await test.step(key, async () => {
      const row = await openSpell(page, key)
      await row.getByText('Editar como JSON').click()
      const field = row.getByLabel(`Valor de ${key} em JSON`)
      const next = anotherValue(JSON.parse(await field.inputValue()))

      await field.fill(JSON.stringify(next))
      await row.getByRole('button', { name: 'Lançar este valor' }).click()
      await expect(page.getByText(`${key} lançado por 1 h.`)).toBeVisible()
      await expect(row.getByText('lançado', { exact: true })).toBeVisible()
      expect((await stored(key))?.value).toEqual(next)

      await row.getByRole('button', { name: 'Voltar ao padrão' }).click()
      await expect(page.getByText(`${key} voltou ao padrão.`)).toBeVisible()
      await expect(row.getByText('no padrão', { exact: true })).toBeVisible()
      expect(await stored(key)).toBeUndefined()
    })
  }
})

test('ligar rating.public_display mostra a ordem por avaliação na busca', async ({
  page
}) => {
  await page.goto('/houdini/feiticos')
  await spell(page, KEY).getByRole('switch', { name: KEY }).click()
  await expect(page.getByText(`${KEY} lançado por 1 h.`)).toBeVisible()

  // A mesma aba vira torcedor: a busca lê a chave pública na carga seguinte.
  await page.context().clearCookies()
  await signIn(page, await createUser())
  await page.goto('/dashboard')
  await expect(
    page.getByRole('button', { name: 'Melhor avaliados' })
  ).toBeVisible()
})
