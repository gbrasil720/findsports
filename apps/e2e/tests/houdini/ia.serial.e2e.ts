import { storageState } from '../../fixtures/auth'
import { query, resetAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Tela "IA" do Houdini (WEB-424). Serial: grava `app_config` e lê o
// `ai_run` inteiro, globais.

test.use({ storageState: storageState('admin') })

test.beforeEach(async () => {
  await query('DELETE FROM ai_run')
})
test.afterEach(async () => {
  await query('DELETE FROM ai_run')
  await resetAppConfig()
})

const GEMINI = 'google/gemini-2.5-flash'
const LUNA = 'openai/gpt-6-luna'

/**
 * Braço A: uma conversa de duas mensagens com ação e outra que falhou; braço
 * B: uma mensagem com rota. Tudo nos últimos minutos.
 */
async function seedRuns() {
  const ana = await createUser({ name: 'Ana da IA' })
  const bia = await createUser({ name: 'Bia da IA' })
  const run = async (
    userId: string,
    variant: 'a' | 'b',
    minutesAgo: number,
    over: Record<string, unknown> = {}
  ) => {
    const model = variant === 'a' ? GEMINI : LUNA
    const row = {
      status: 'ok',
      useful: true,
      served_model: model,
      latency_ms: 800,
      cost_usd: 0.25,
      ...over
    }
    const [inserted] = await query<{ run_id: string }>(
      `INSERT INTO ai_run (run_id, user_id, feature, variant, assigned_model, served_model,
         status, useful, latency_ms, cost_usd, created_at)
       VALUES (gen_random_uuid()::text, $1, 'chat', $2, $3, $4, $5, $6, $7, $8, now() - make_interval(mins => $9))
       RETURNING run_id`,
      [
        userId,
        variant,
        model,
        row.served_model,
        row.status,
        row.useful,
        row.latency_ms,
        row.cost_usd,
        minutesAgo
      ]
    )
    return inserted?.run_id as string
  }
  const first = await run(ana.id, 'a', 3)
  await run(ana.id, 'a', 2)
  // A falha 1 min depois segue na mesma conversa (pausa menor que 30 min).
  await run(ana.id, 'a', 1, {
    status: 'error',
    useful: false,
    served_model: null,
    cost_usd: 0
  })
  const second = await run(bia.id, 'b', 2)
  await query(
    `INSERT INTO ai_action (id, run_id, kind) VALUES
       (gen_random_uuid()::text, $1, 'open_bar'), (gen_random_uuid()::text, $2, 'route')`,
    [first, second]
  )
  return { ana, bia }
}

test('mostra os números semeados, liga e desliga a IA e muda um peso', async ({
  page
}) => {
  const { ana } = await seedRuns()
  await page.goto('/houdini/ia')

  // Situação: desligada (padrão) e o gasto do mês com o teto.
  const toggle = page.getByRole('switch', { name: 'IA ligada' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Desligada', { exact: true })).toBeVisible()
  const budget = page.getByRole('article', { name: 'Gasto do mês' })
  await expect(budget).toContainText('US$ 0,75')
  await expect(budget).toContainText('teto US$ 40,00')

  // Teste do chat: A tem 3 mensagens, 2 úteis, 1 erro, 1 conversa com ação.
  const table = page.getByRole('table').filter({ hasText: 'Braço A' })
  const row = (name: string) =>
    table
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name, exact: true }) })
  await expect(row('Mensagens')).toContainText('3')
  await expect(row('Respostas úteis')).toContainText('2 · 67%')
  await expect(row('Conversão (ação em 24 h)')).toContainText('1 de 1 · 100%')
  await expect(row('Custo por resposta útil')).toContainText('US$ 0,2500')
  await expect(page.getByText('amostra insuficiente')).toBeVisible()
  await expect(page.getByText('ainda não ligado')).toBeVisible()

  // Quem mais gasta abre a ficha da pessoa.
  const top = page.getByRole('table').filter({ hasText: 'Mais gasto no mês' })
  await expect(top.getByRole('link', { name: ana.name })).toBeVisible()

  // Registro: o filtro de situação deixa só a falha.
  await page.getByRole('combobox', { name: 'Situação' }).selectOption('error')
  const log = page.getByRole('table').filter({ hasText: 'Funcionalidade' })
  await expect(log.getByRole('row')).toHaveCount(2)
  await expect(log).toContainText('erro')

  // Ligar pede confirmação e grava sem prazo.
  await toggle.click()
  await page.getByRole('button', { name: 'Ligar a IA' }).click()
  await expect(page.getByText('ai.enabled lançado.')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Ligada', { exact: true })).toBeVisible()
  const [enabled] = await query<{ value: unknown; expires_at: unknown }>(
    `SELECT value, expires_at FROM app_config WHERE key = 'ai.enabled'`
  )
  expect(enabled).toEqual({ value: true, expires_at: null })

  // Cancelar não muda nada; confirmar desliga.
  await toggle.click()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await page.getByRole('button', { name: 'Desligar a IA' }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  // Peso do chat: soma errada não deixa mudar; 70/30 grava e fica no
  // Grimório com quem mudou.
  const weights = page.getByRole('region', { name: 'Teste do chat' })
  await weights.getByLabel('A · Gemini 2.5 Flash').fill('70')
  await expect(weights.getByText('soma 120, precisa ser 100')).toBeVisible()
  await expect(
    weights.getByRole('button', { name: 'Mudar pesos' })
  ).toBeDisabled()
  await weights.getByLabel('B · GPT-6 Luna').fill('30')
  await weights.getByRole('button', { name: 'Mudar pesos' }).click()
  await expect(weights).toContainText('de A 50 / B 50 para A 70 / B 30')
  await weights.getByRole('button', { name: 'Confirmar pesos' }).click()
  await expect(page.getByText('ai.variant_weights lançado.')).toBeVisible()
  await expect(table).toContainText('peso 70%')
  const [stored] = await query<{ value: { chat: unknown } }>(
    `SELECT value FROM app_config WHERE key = 'ai.variant_weights'`
  )
  expect(stored?.value.chat).toEqual({ a: 70, b: 30 })
  const [logged] = await query<{ actor_name: string }>(
    `SELECT actor_name FROM admin_action
     WHERE kind = 'config.set' AND target_id = 'ai.variant_weights'
     ORDER BY created_at DESC LIMIT 1`
  )
  expect(logged?.actor_name).toBe('E2E admin')
})

test('limites editam com confirmação e o servidor recusa o absurdo', async ({
  page
}) => {
  await page.goto('/houdini/ia')
  const card = page.getByRole('region', { name: 'Limites' })
  await card.getByLabel('Mensagens do chat no dia').fill('20')
  await card.getByRole('button', { name: 'Mudar limites' }).click()
  await expect(card).toContainText('mensagens do chat no dia de 10 para 20')
  await card.getByRole('button', { name: 'Confirmar limites' }).click()
  await expect(page.getByText('ai.limits lançado.')).toBeVisible()
  const [stored] = await query<{ value: { chatDailyMessages: number } }>(
    `SELECT value FROM app_config WHERE key = 'ai.limits'`
  )
  expect(stored?.value.chatDailyMessages).toBe(20)
  // A situação passa a contar pelo limite novo.
  await expect(page.getByText('20 mensagens no dia')).toBeVisible()

  // Dia acima do mês: quem recusa é o servidor, com o motivo.
  await card.getByLabel('Mensagens do chat no dia').fill('150')
  await card.getByRole('button', { name: 'Mudar limites' }).click()
  await card.getByRole('button', { name: 'Confirmar limites' }).click()
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]')
  ).toContainText(
    'Valor recusado — O limite do dia não pode passar do limite do mês.'
  )
})
