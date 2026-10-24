import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createEvent } from '../../fixtures/going'
import { createPub, inDays, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Avisos do painel e card do plano (Rodada 3, telas 1t–1w e 3s): no máximo um
// aviso por tela, o de maior prioridade, e o card do plano em Hoje.

const STARTER_LIMIT = 5

async function entrar(page: Page, options: PubOptions) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  return pub
}

const aviso = (page: Page) =>
  page.getByRole('region', { name: 'Aviso do plano' })
const plano = (page: Page) => page.getByRole('region', { name: 'Seu plano' })

test('trial do cadastro: aviso em Hoje, não em Jogos, e o card com os dias', async ({
  page
}) => {
  await entrar(page, {
    subscription: { status: 'trialing', currentPeriodEnd: inDays(100) }
  })

  await page.goto('/admin')
  await expect(aviso(page)).toContainText('Trial gratuito do Elite até')
  await expect(
    aviso(page).getByRole('link', { name: 'Garantir o Elite' })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(plano(page)).toContainText('Trial gratuito')
  await expect(plano(page)).toContainText('de 120 dias usados')
  await expect(
    plano(page).getByRole('link', { name: 'Garantir o Elite · R$ 0 hoje' })
  ).toBeVisible()

  await page.goto('/admin/jogos')
  await expect(page.getByRole('heading', { name: 'Jogos' })).toBeVisible()
  await expect(aviso(page)).toHaveCount(0)
})

test('Starter no limite: Hoje troca "Novo jogo" por "Ver grade"', async ({
  page
}) => {
  const { barId } = await entrar(page, { subscription: { plan: 'starter' } })
  for (let i = 0; i < STARTER_LIMIT; i++) await createEvent(barId)

  await page.goto('/admin')
  await expect(aviso(page)).toContainText('Limite de jogos atingido até')
  await expect(page.getByRole('link', { name: 'Novo jogo' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ver grade' })).toHaveAttribute(
    'href',
    '/admin/jogos'
  )
  await expect(plano(page)).toContainText('Limite atingido')
})

test('Elite com pagamento pendente: aviso em Hoje e em Plano e cobrança', async ({
  page
}) => {
  const { barId } = await entrar(page, {
    subscription: { plan: 'elite', status: 'past_due' }
  })
  for (let i = 0; i < STARTER_LIMIT - 1; i++) await createEvent(barId)

  await page.goto('/admin')
  await expect(aviso(page)).toContainText(
    'Pagamento pendente — 1 de 5 jogos restantes'
  )
  await expect(
    aviso(page).getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(plano(page)).toContainText('Pagamento pendente')
  await expect(plano(page)).toContainText('4 de 5 jogos do Starter usados')

  await page.goto('/admin/billing')
  await expect(aviso(page)).toContainText('Plano Elite com pagamento pendente')
  await expect(aviso(page)).toContainText(
    'a oferta da casa e a lista de quem vai'
  )
  await expect(
    page.getByText('por mês · cobrança não confirmada')
  ).toBeVisible()
})

test('fora do ar: aviso, card sem plano e "Ver grade"', async ({ page }) => {
  await entrar(page, { bar: { is_active: false } })

  await page.goto('/admin')
  await expect(aviso(page)).toContainText(
    'Seu bar não está visível na plataforma'
  )
  await expect(
    aviso(page).getByRole('link', { name: 'Ver planos' })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(
    page.getByText('Fora das buscas e do mapa', { exact: true })
  ).toBeVisible()
  await expect(plano(page)).toContainText('Sem plano')
  await expect(plano(page)).toContainText(
    'O bar está fora das buscas e do mapa.'
  )
  await expect(page.getByRole('link', { name: 'Ver grade' })).toBeVisible()
})
