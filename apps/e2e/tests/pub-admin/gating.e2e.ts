import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { createEvent, soccerSportId } from '../../fixtures/reservations'
import { expect, test } from '../../fixtures/test'

// Gating por plano no painel do bar: cada recurso pago (cardápio = Pro,
// oferta da casa e reservas = Elite) mostra o aviso certo para cada plano, e o
// servidor recusa o que a tela esconde. Reservas se marcam por jogo, no
// formulário do jogo em "Minha grade".

const RESERVATIONS = 'Aceitar reservas neste jogo'

/** Abre o formulário de um jogo já cadastrado, em "Minha grade". */
async function editGame(page: Page, championship: string) {
  await page.goto('/admin#admin-grade')
  await page
    .getByRole('listitem')
    .filter({ hasText: championship })
    .getByRole('button', { name: 'Editar evento' })
    .click()
  return page.getByRole('dialog', { name: 'Editar evento' })
}

/** `game` cadastra um jogo antes da primeira tela: a grade lê uma vez só. */
async function openSpace(
  page: Page,
  options: PubOptions,
  game?: { acceptsReservations: boolean }
) {
  const pub = await createPub(options)
  const created = game ? await createEvent(pub.barId, game) : null
  await signIn(page, pub.user)
  await page.goto('/admin#admin-espaco')
  await expect(page.getByRole('tab', { name: 'Meu espaço' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  return { ...pub, game: created }
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
  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
  await expect(
    card(page, 'Cardápio e preço médio').getByRole('link', {
      name: 'Ver planos'
    })
  ).toHaveAttribute('href', /\/plan\?origin=admin/)
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)

  // No jogo novo, "Aceitar reservas" fica travado e diz por quê.
  await page.goto('/admin#admin-grade')
  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo evento' })
  await expect(
    dialog.getByRole('checkbox', { name: RESERVATIONS })
  ).toBeDisabled()
  await expect(dialog).toContainText(
    'Receber reservas é um recurso do plano Elite.'
  )
})

test('sem assinatura: tudo bloqueado, como no Starter', async ({ page }) => {
  const pub = await createPub({ subscription: null })
  // Jogo marcado sem plano não abre a aba.
  await createEvent(pub.barId, { acceptsReservations: true })
  await signIn(page, pub.user)
  await page.goto('/admin#admin-espaco')

  await expect(card(page, 'Cardápio e preço médio')).toContainText(
    'Disponível nos planos Pro e Elite'
  )
  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
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

  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
})

test('Elite marca o jogo para reservas e ganha a aba Reservas', async ({
  page
}) => {
  const { game } = await openSpace(
    page,
    { subscription: { plan: 'elite' } },
    { acceptsReservations: false }
  )
  if (!game) throw new Error('jogo não criado')
  const { eventId, championship } = game
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)

  const dialog = await editGame(page, championship)
  const checkbox = dialog.getByRole('checkbox', { name: RESERVATIONS })
  await expect(checkbox).toBeEnabled()
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Reservas' })).toBeVisible()
  const [stored] = await query(
    'SELECT accepts_reservations FROM event WHERE id = $1',
    [eventId]
  )
  expect(stored?.accepts_reservations).toBe(true)

  // Editar de novo mostra a marcação gravada.
  const again = await editGame(page, championship)
  await expect(
    again.getByRole('checkbox', { name: RESERVATIONS })
  ).toBeChecked()
})

test('Elite com pagamento atrasado vê "Regularizar assinatura", não os planos', async ({
  page
}) => {
  const { game } = await openSpace(
    page,
    { subscription: { plan: 'elite', status: 'past_due' } },
    { acceptsReservations: true }
  )
  if (!game) throw new Error('jogo não criado')

  const offer = card(page, 'Oferta da casa')
  await expect(
    offer.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(offer.getByRole('link', { name: 'Ver planos' })).toHaveCount(0)
  // Jogo marcado sem plano: a aba some, e a marcação ainda se desfaz.
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)
  const dialog = await editGame(page, game.championship)
  const checkbox = dialog.getByRole('checkbox', { name: RESERVATIONS })
  await expect(checkbox).toBeChecked()
  await expect(checkbox).toBeEnabled()
  await expect(dialog).toContainText(
    'Sem o Elite, este jogo não recebe pedidos'
  )
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
      await call('pub.createEvent', {
        sportId: await soccerSportId(),
        championship: 'Com reserva',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        acceptsReservations: true
      })
    ).status()
  ).toBe(403)

  const [bar] = await query(
    'SELECT menu_url, house_offer FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(bar).toEqual({ menu_url: null, house_offer: null })
  expect(
    await query('SELECT id FROM event WHERE bar_id = $1', [pub.barId])
  ).toEqual([])
})
