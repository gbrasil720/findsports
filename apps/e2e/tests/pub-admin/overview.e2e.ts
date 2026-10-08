import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert } from '../../fixtures/db'
import { createPub, type Plan } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Visão geral (analytics comerciais) por plano: Starter vê só aberturas em
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
  await page.goto('/admin')
  return pub
}

const periods = (page: Page) =>
  page.getByRole('region', { name: 'Período das analytics' })
const overview = (page: Page) =>
  page.getByRole('region', { name: 'Visão geral' })
const LOCKED = 'Exclusivo do plano superior'

test('Starter: 30 dias, só aberturas', async ({ page }) => {
  await openOverview(page, 'starter')

  await expect(periods(page)).toContainText('Seu plano permite até 30 dias.')
  await expect(
    periods(page).getByRole('button', { name: '30 dias' })
  ).toBeVisible()
  for (const name of ['12 meses', 'Tudo']) {
    await expect(periods(page).getByRole('button', { name })).toHaveCount(0)
  }
  await expect(overview(page)).toContainText('abriram 1 vez no total')
  // Telefone, WhatsApp e rota: os três canais travados.
  await expect(overview(page).getByText(LOCKED)).toHaveCount(3)
  await expect(overview(page)).not.toContainText('Atividade diária')
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
  await expect(overview(page).getByText(LOCKED)).toHaveCount(0)
  await expect(overview(page)).toContainText('Telefone')
  await expect(overview(page)).not.toContainText('Atividade diária')
  // WEB-251: um torcedor com três ações é uma pessoa interessada, não 300%.
  await expect(overview(page)).toContainText('100.0%')
  await expect(overview(page)).not.toContainText('300.0%')
})

test('Elite: todo o histórico e a atividade diária', async ({ page }) => {
  await openOverview(page, 'elite')

  await expect(periods(page)).toContainText(
    'Seu plano permite todo o histórico disponível.'
  )
  await expect(
    periods(page).getByRole('button', { name: 'Tudo' })
  ).toBeVisible()
  await expect(overview(page).getByText(LOCKED)).toHaveCount(0)
  await expect(overview(page)).toContainText('Atividade diária')
})
