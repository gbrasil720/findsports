import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query, resetAppConfig } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

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
  // Pesos dos testes de IA (WEB-424): o chat inteiro num braço (soma 100).
  if (
    value !== null &&
    typeof value === 'object' &&
    'chat' in value &&
    'recommender' in value
  ) {
    const weights = value as { chat: { a: number; b: number } }
    const a = weights.chat.a === 100 ? 0 : 100
    return { ...weights, chat: { a, b: 100 - a } }
  }
  // Limites da IA: uma chamada a mais por pessoa no dia.
  if (
    value !== null &&
    typeof value === 'object' &&
    'userDailyCalls' in value
  ) {
    const limits = value as { userDailyCalls: number }
    return { ...limits, userDailyCalls: limits.userDailyCalls + 1 }
  }
  // Manutenção do app (WEB-466): o contrário, sem previsão.
  if (value !== null && typeof value === 'object' && 'backAt' in value) {
    const maintenance = value as { on: boolean }
    return { on: !maintenance.on, backAt: null }
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
    'ai.limits',
    'ai.variant_weights',
    'app.maintenance',
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

/** O que o app lê (WEB-466). */
async function appStatus(page: Page) {
  const response = await page.request.get('/api/app/status')
  expect(response.ok()).toBe(true)
  expect(response.headers()['cache-control']).toBe('no-store')
  return (
    (await response.json()) as {
      maintenance: { on: boolean; backAt: string | null }
    }
  ).maintenance
}

// WEB-466: o interruptor da manutenção do app (26d, 26e), com a previsão.
// Ligado, o painel do bar e o Houdini continuam no ar.
test('manutenção do app liga com previsão, muda a previsão e desliga', async ({
  page,
  browser,
  extraHTTPHeaders
}) => {
  await page.goto('/houdini/feiticos')
  const card = page.locator('article').filter({
    has: page.getByRole('switch', { name: 'App em manutenção' })
  })
  const toggle = card.getByRole('switch', { name: 'App em manutenção' })
  const confirm = card.getByRole('alertdialog')

  await expect(card).toContainText('No ar')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(await appStatus(page)).toEqual({ on: false, backAt: null })

  // Pede confirmação; cancelar não grava.
  await toggle.click()
  await expect(confirm).toContainText('Pôr o app em manutenção (volta em 1 h)?')
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirm).toHaveCount(0)
  expect(await stored('app.maintenance')).toBeUndefined()

  const before = Date.now()
  await toggle.click()
  await confirm.getByRole('button', { name: 'Pôr em manutenção' }).click()
  await expect(page.getByText('App em manutenção.')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(card).toContainText('Em manutenção')
  await expect(card).toContainText(
    /Previsão de volta \d\d:\d\d, faltam cerca de (1 h|55 min)\./
  )
  const on = await appStatus(page)
  expect(on.on).toBe(true)
  const minutes = (Date.parse(on.backAt ?? '') - before) / 60_000
  expect(minutes).toBeGreaterThan(59)
  expect(minutes).toBeLessThan(61)
  // Sem prazo: a manutenção só sai pelo interruptor.
  expect((await stored('app.maintenance'))?.minutes_left).toBeNull()

  // O Grimório anota quem ligou.
  const [entry] = await query<{ actor_name: string }>(
    `SELECT actor_name FROM admin_action
     WHERE kind = 'config.set' AND target_id = 'app.maintenance'
     ORDER BY created_at DESC LIMIT 1`
  )
  expect(entry?.actor_name).toBe('E2E admin')

  // O painel do bar segue no ar: a validação do código abre.
  const pubContext = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders
  })
  try {
    const pubPage = await pubContext.newPage()
    await signIn(
      pubPage,
      (await createPub({ subscription: { plan: 'elite' } })).user
    )
    await pubPage.goto('/admin/validate')
    await expect(pubPage.getByLabel('Código', { exact: true })).toBeVisible()
  } finally {
    await pubContext.close()
  }

  // Nova previsão: sem previsão, o app não mostra contagem.
  await card
    .getByRole('group', { name: 'Previsão de volta' })
    .getByRole('button', { name: 'Sem previsão' })
    .click()
  await card.getByRole('button', { name: 'Mudar a previsão' }).click()
  await expect(confirm).toContainText(
    'Mudar a previsão de volta (sem previsão)?'
  )
  await confirm.getByRole('button', { name: 'Mudar a previsão' }).click()
  await expect(card).toContainText('Sem previsão de volta')
  expect(await appStatus(page)).toEqual({ on: true, backAt: null })

  await page.reload()
  await toggle.click()
  await expect(confirm).toContainText('Tirar o app da manutenção?')
  await confirm.getByRole('button', { name: 'Tirar da manutenção' }).click()
  await expect(page.getByText('App de volta ao ar.')).toBeVisible()
  await expect(card).toContainText('No ar')
  expect(await appStatus(page)).toEqual({ on: false, backAt: null })
})
