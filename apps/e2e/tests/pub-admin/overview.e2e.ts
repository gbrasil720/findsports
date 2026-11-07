import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert } from '../../fixtures/db'
import { createPub, type Plan } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Desempenho (analytics comerciais) por plano: Starter vê só aberturas em
// até 30 dias; Pro ganha telefone, WhatsApp e rota em até 365 dias; Elite tem
// todo o histórico e a atividade diária.

/** Bar do plano com uma abertura de perfil e um clique em cada canal, hoje. */
async function openOverview(page: Page, plan: Plan) {
  const pub = await createPub({ subscription: { plan } })
  const fan = await createUser()
  const today = new Date().toLocaleDateString('sv-SE', {
    timeZone: 'America/Sao_Paulo'
  })
  for (const type of [
    'profile_view',
    'phone_clicked',
    'whatsapp_opened',
    'directions_opened'
  ]) {
    await insert('bar_commercial_event', {
      id: randomUUID(),
      bar_id: pub.barId,
      actor_user_id: fan.id,
      type,
      occurred_at: new Date(),
      commercial_day: today
    })
  }
  await signIn(page, pub.user)
  await page.goto('/admin/desempenho')
  return pub
}

const periods = (page: Page) =>
  page.getByRole('region', { name: 'Período das analytics' })
const overview = (page: Page) => page.locator('#painel-main')
const channels = (page: Page) =>
  page.getByRole('region', { name: 'Como te procuraram' })
const daily = (page: Page) =>
  page.getByRole('region', { name: 'Atividade diária' })

test('Starter: 30 dias, só aberturas', async ({ page }) => {
  await openOverview(page, 'starter')

  await expect(periods(page)).toContainText('Seu plano permite até 30 dias.')
  await expect(
    periods(page).getByRole('button', { name: '30 dias' })
  ).toBeVisible()
  for (const name of ['12 meses', 'Tudo']) {
    await expect(periods(page).getByRole('button', { name })).toHaveCount(0)
  }
  await expect(overview(page)).toContainText('abriram 1 vez a página do bar')
  // Telefone, WhatsApp e rota: os canais travados, com o caminho do plano.
  await expect(channels(page)).toContainText(
    'WhatsApp, rota e telefone, canal a canal, são do Pro e do Elite.'
  )
  await expect(daily(page)).toContainText('é do plano Elite')
  await expect(
    page.getByRole('button', { name: 'Comparar jogos' })
  ).toHaveCount(0)
})

test('Pro: 365 dias e os canais de contato, sem quebra diária', async ({
  page
}) => {
  await openOverview(page, 'pro')

  await expect(periods(page)).toContainText('Seu plano permite até 365 dias.')
  await expect(
    periods(page).getByRole('button', { name: '12 meses' })
  ).toBeVisible()
  await expect(periods(page).getByRole('button', { name: 'Tudo' })).toHaveCount(
    0
  )
  await expect(channels(page)).toContainText('Telefone')
  await expect(channels(page)).not.toContainText('são do Pro e do Elite')
  await expect(daily(page)).toContainText('é do plano Elite')
  // WEB-251: um torcedor com três ações é uma pessoa interessada, não 300%.
  const summary = page.getByRole('region', { name: 'Resumo do período' })
  await expect(summary).toContainText('100%')
  await expect(summary).not.toContainText('300%')
})

test('Elite: todo o histórico e a atividade diária', async ({ page }) => {
  await openOverview(page, 'elite')

  await expect(periods(page)).toContainText(
    'Seu plano permite todo o histórico disponível.'
  )
  await expect(
    periods(page).getByRole('button', { name: 'Tudo' })
  ).toBeVisible()
  await expect(channels(page)).toContainText('Telefone')
  await expect(
    daily(page).getByRole('slider', { name: /Atividade diária/ })
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Quem foi pela Onside' })
  ).toContainText('marcaram que iam')
})

// WEB-344: card de plano e Desempenho contam a mesma história quando o plano
// gravado não vale.
test('trial vencido: o Desempenho diz por que o plano em vigor é o Starter', async ({
  page
}) => {
  const pub = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - 86_400_000)
    }
  })
  await signIn(page, pub.user)
  await page.goto('/admin')

  await expect(page.locator('#painel-main')).toContainText('Teste encerrado')
  await page.goto('/admin/desempenho')
  await expect(overview(page)).toContainText(
    'Plano Starter · Teste do plano Elite encerrado'
  )
})

// WEB-357: o teste do cadastro que vence sem contratação tira o bar do ar
// (cron diário). O dono lê que o bar não está visível, não o limite de jogos
// do Starter, e o caminho é contratar.
test('trial vencido e bar fora do ar: aviso de bar não visível e o caminho para contratar', async ({
  page
}) => {
  const pub = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - 86_400_000)
    },
    bar: { is_active: false }
  })
  await signIn(page, pub.user)
  // O aviso de limite depende da política: só vale conferir depois dela.
  const policy = page.waitForResponse((response) =>
    response.url().includes('pub.getMyEventCreationPolicy')
  )
  await page.goto('/admin')
  await policy

  const panel = page.locator('#painel-main')
  await expect(panel).toContainText('Seu bar não está visível na plataforma')
  await expect(panel).toContainText('Teste encerrado')
  await expect(panel).not.toContainText(/restantes?/)
  await expect(
    panel.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveCount(0)

  const plans = panel.getByRole('link', { name: 'Ver planos' })
  await expect(plans).toHaveAttribute('href', '/plan?origin=admin')
  await plans.click()
  await expect(
    page.getByRole('heading', { name: 'Seu teste do Elite acabou' })
  ).toBeVisible()
  await expect(
    page.getByText('Contrate um plano para o bar voltar às buscas e ao mapa')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Contratar o Elite' }).first()
  ).toBeVisible()
})

test('bar sem assinatura: "Sem plano" com o caminho para escolher um', async ({
  page
}) => {
  const pub = await createPub({ subscription: null })
  await signIn(page, pub.user)
  // O aviso de limite depende da política: só vale conferir depois dela.
  const policy = page.waitForResponse((response) =>
    response.url().includes('pub.getMyEventCreationPolicy')
  )
  await page.goto('/admin')
  await policy

  const panel = page.locator('#painel-main')
  await expect(panel).toContainText('Sem plano')
  await expect(
    panel.getByRole('link', { name: 'Escolher um plano' })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(panel).not.toContainText('Plano atual')
  // Sem assinatura o bar cai no limite do Starter, mas não lê aviso do
  // Starter nem a contagem dele: o Starter é só o default da coluna.
  await expect(panel).not.toContainText(/Plano Starter —|no plano Starter/)
  await expect(panel).not.toContainText(/restantes?/)
  // O Desempenho segue o card: não chama de Starter quem não tem plano.
  await page.goto('/admin/desempenho')
  await expect(panel).toContainText('Sem plano · Nenhuma assinatura ativa')
  await expect(panel).not.toContainText('Plano Starter')
})
