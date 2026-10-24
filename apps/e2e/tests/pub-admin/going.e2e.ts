import { randomUUID } from 'node:crypto'
import { signIn } from '../../fixtures/auth'
import { createEvent, createTicket } from '../../fixtures/going'
import { painelLink } from '../../fixtures/painel'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Aba "Quem vai" do painel (substituiu a fila de pedidos de reserva em
// 16/10/2026): por jogo, quem marcou "Vou assistir aqui" e quem já validou o
// código no balcão. Ninguém aprova nada.

test('lista quem vai por jogo e marca quem já validou', async ({ page }) => {
  const pub = await createPub()
  const { eventId, championship } = await createEvent(pub.barId)
  const arrived = await createTicket(eventId)
  const coming = await createTicket(eventId)
  await signIn(page, pub.user)

  // Um dos dois já passou no balcão.
  const found = await page.request.post(
    '/api/trpc/reservationValidation.lookup',
    { data: { code: arrived.code } }
  )
  const { codeId } = (await found.json()).result.data
  const registered = await page.request.post(
    '/api/trpc/reservationValidation.registerArrival',
    { data: { codeId, requestId: randomUUID() } }
  )
  expect(registered.ok()).toBe(true)

  await page.goto('/admin/quem-vai')
  await expect(painelLink(page, 'Quem vai')).toHaveAttribute(
    'aria-current',
    'page'
  )
  const game = page.getByRole('article', { name: championship })
  await expect(game).toContainText('2 vão assistir · 1 validou')
  await expect(
    game.getByRole('listitem').filter({ hasText: arrived.guestName })
  ).toContainText('Validou')
  await expect(
    game.getByRole('listitem').filter({ hasText: coming.guestName })
  ).not.toContainText('Validou')
  await expect(game.getByRole('listitem')).toHaveCount(2)
})

test('ninguém marcou: a aba diz que está vazia', async ({ page }) => {
  const pub = await createPub()
  await createEvent(pub.barId)
  await signIn(page, pub.user)
  await page.goto('/admin/quem-vai')
  await expect(page.getByText('Ninguém marcou ainda.')).toBeVisible()
})

test('link direto para Quem vai sem Elite cai em Hoje', async ({ page }) => {
  const pub = await createPub({ subscription: { plan: 'pro' } })
  await createEvent(pub.barId)
  await signIn(page, pub.user)
  await page.goto('/admin/quem-vai')
  await expect(page).toHaveURL(/\/admin$/)
  await expect(painelLink(page, 'Hoje')).toHaveAttribute('aria-current', 'page')
  await expect(painelLink(page, 'Quem vai')).toHaveCount(0)
})

// WEB-341: o trial vence com código em aberto. O bar não ganha gente nova pela
// lista, mas ainda vê e valida quem já marcou.
test('trial Elite vencido com código em aberto: a aba Quem vai fica e o código valida', async ({
  page
}) => {
  const pub = await createPub({
    subscription: { status: 'trialing', currentPeriodEnd: inDays(-1) }
  })
  const { eventId } = await createEvent(pub.barId)
  const ticket = await createTicket(eventId, {
    offerSnapshot: 'Chopp em dobro'
  })
  await signIn(page, pub.user)

  await page.goto('/admin/quem-vai')
  await expect(painelLink(page, 'Quem vai')).toHaveAttribute(
    'aria-current',
    'page'
  )
  const panel = page.getByRole('main')
  await expect(panel.getByRole('note')).toContainText(
    'A lista de quem vai é um recurso do plano Elite.'
  )
  await expect(panel).toContainText(ticket.guestName)

  await page.goto('/admin/validate')
  await page.getByLabel('Código', { exact: true }).fill(ticket.code)
  await page.getByRole('button', { name: 'Buscar código' }).click()
  await expect(
    page.getByRole('heading', { level: 3, name: ticket.guestName })
  ).toBeVisible()
  await expect(page.getByText('Chopp em dobro')).toBeVisible()
  await page.getByRole('button', { name: 'Validar código' }).click()
  await page
    .getByRole('dialog', { name: 'Validar o código?' })
    .getByRole('button', { name: 'Sim, validar' })
    .click()
  await expect(
    page.getByText('Código validado. Libere a oferta da casa.')
  ).toBeVisible()
})

// WEB-412: o bar Elite que confirma pela comanda lança em Quem vai os códigos
// anotados; "Faltou lançar?" diz quem ainda falta.
test('bar que confirma pela comanda lança o código anotado em Quem vai', async ({
  page
}) => {
  const pub = await createPub({ bar: { confirms_codes_later: true } })
  const { eventId, championship } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 3_600_000)
  })
  const ticket = await createTicket(eventId)
  await signIn(page, pub.user)

  await page.goto('/admin/quem-vai')
  const comanda = page.getByRole('region', {
    name: 'Lançar códigos da comanda'
  })
  await expect(comanda).toContainText('Faltou lançar?')
  await expect(comanda).toContainText(ticket.guestName)

  await comanda.getByLabel('Códigos anotados').fill(ticket.code.toLowerCase())
  await comanda.getByRole('button', { name: 'Lançar código' }).click()
  await expect(comanda).toContainText('1 código lançado')
  await expect(comanda).not.toContainText('Faltou lançar?')

  const game = page.getByRole('article', { name: championship })
  await expect(
    game.getByRole('listitem').filter({ hasText: ticket.guestName })
  ).toContainText('Validou')
})
