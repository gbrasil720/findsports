import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Gating por plano no painel do bar: cada recurso pago (cardápio = Pro,
// oferta da casa e reservas = Elite) mostra o aviso certo para cada plano, e o
// servidor recusa o que a tela esconde.

async function openSpace(page: Page, options: PubOptions) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  await page.goto('/admin#admin-espaco')
  await expect(page.getByRole('tab', { name: 'Meu espaço' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  return pub
}

/** Card de recurso pago: `section` rotulada pelo título. */
const card = (page: Page, title: string) =>
  page.getByRole('region', { name: title, exact: true })

test('Starter: cardápio, oferta e reservas bloqueados, com link para os planos', async ({
  page
}) => {
  await openSpace(page, { subscription: { plan: 'starter' } })

  await expect(card(page, 'Cardápio e preço médio')).toContainText(
    'Disponível nos planos Pro e Elite'
  )
  for (const title of ['Oferta da casa', 'Reservas pela Onside']) {
    await expect(card(page, title)).toContainText('Disponível no plano Elite')
  }
  await expect(
    card(page, 'Cardápio e preço médio').getByRole('link', {
      name: 'Ver planos'
    })
  ).toHaveAttribute('href', /\/plan\?origin=admin/)
  await expect(
    page.getByRole('switch', { name: 'Receber pedidos de reserva' })
  ).toBeDisabled()
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)
})

test('sem assinatura: tudo bloqueado, como no Starter', async ({ page }) => {
  await openSpace(page, {
    subscription: null,
    bar: { accepts_reservations: true }
  })

  await expect(card(page, 'Cardápio e preço médio')).toContainText(
    'Disponível nos planos Pro e Elite'
  )
  for (const title of ['Oferta da casa', 'Reservas pela Onside']) {
    await expect(card(page, title)).toContainText('Disponível no plano Elite')
  }
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)
})

test('as abas trocam pelo clique e pelo hash, e Configurações renderiza', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.getByRole('tab', { name: 'Configurações' }).click()
  await expect(page).toHaveURL(/#admin-configuracoes$/)
  await expect(
    page.getByRole('heading', { name: 'Configurações', level: 2 })
  ).toBeVisible()

  await page.goto('/admin#admin-grade')
  await expect(
    page.getByRole('heading', { name: 'Minha grade', level: 2 })
  ).toBeVisible()
})

test('Pro: cardápio liberado e salvo; oferta e reservas seguem bloqueadas', async ({
  page
}) => {
  const { barId } = await openSpace(page, { subscription: { plan: 'pro' } })

  const menu = card(page, 'Cardápio e preço médio')
  await expect(menu).not.toContainText('Disponível nos planos')
  await menu
    .getByLabel(/link do cardápio/i)
    .fill('https://cardapio.e2e.test/menu')
  await menu.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(async () => {
      const [bar] = await query('SELECT menu_url FROM bar WHERE id = $1', [
        barId
      ])
      return bar?.menu_url
    })
    .toBe('https://cardapio.e2e.test/menu')

  for (const title of ['Oferta da casa', 'Reservas pela Onside']) {
    await expect(card(page, title)).toContainText('Disponível no plano Elite')
  }
})

test('Elite liga reservas e ganha a aba Reservas', async ({ page }) => {
  await openSpace(page, { subscription: { plan: 'elite' } })
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)

  const intake = page.getByRole('switch', {
    name: 'Receber pedidos de reserva'
  })
  await expect(intake).toHaveAttribute('aria-checked', 'false')
  await intake.click()
  await expect(intake).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('tab', { name: 'Reservas' })).toBeVisible()
})

test('Elite com pagamento atrasado vê "Regularizar assinatura", não os planos', async ({
  page
}) => {
  await openSpace(page, {
    subscription: { plan: 'elite', status: 'past_due' },
    bar: { accepts_reservations: true }
  })

  const offer = card(page, 'Oferta da casa')
  await expect(
    offer.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(offer.getByRole('link', { name: 'Ver planos' })).toHaveCount(0)
  // Reservas ligadas sem plano: a aba some, e o interruptor ainda desliga,
  // sem dizer "Ligado" (WEB-353).
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)
  const intake = page.getByRole('switch', {
    name: 'Receber pedidos de reserva'
  })
  await expect(intake).toBeEnabled()
  await expect(intake).toHaveText('Pausado (sem Elite)')
})

test('o servidor recusa recurso pago fora do plano', async ({ page }) => {
  const pub = await createPub({ subscription: { plan: 'starter' } })
  await signIn(page, pub.user)
  const call = (path: string, data: unknown) =>
    page.request.post(`/api/trpc/${path}`, { data })

  expect(
    (
      await call('pub.updateMenuInfo', {
        menuUrl: 'https://cardapio.e2e.test'
      })
    ).status()
  ).toBe(403)
  expect(
    (
      await call('pub.updateHouseOffer', { houseOffer: 'Chope grátis' })
    ).status()
  ).toBe(403)
  expect(
    (
      await call('pub.updateAcceptsReservations', { acceptsReservations: true })
    ).status()
  ).toBe(403)

  const [bar] = await query(
    'SELECT menu_url, house_offer, accepts_reservations FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(bar).toEqual({
    menu_url: null,
    house_offer: null,
    accepts_reservations: false
  })
})
