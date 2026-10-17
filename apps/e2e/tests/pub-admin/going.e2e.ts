import { randomUUID } from 'node:crypto'
import { signIn } from '../../fixtures/auth'
import { createEvent, createTicket } from '../../fixtures/going'
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

  await page.goto('/admin#admin-quem-vai')
  await expect(page.getByRole('tab', { name: 'Quem vai' })).toHaveAttribute(
    'aria-selected',
    'true'
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
  await page.goto('/admin#admin-quem-vai')
  await expect(page.getByText('Ninguém marcou ainda.')).toBeVisible()
})

test('link direto para Quem vai sem Elite cai na Visão geral', async ({
  page
}) => {
  const pub = await createPub({ subscription: { plan: 'pro' } })
  await createEvent(pub.barId)
  await signIn(page, pub.user)
  await page.goto('/admin#admin-quem-vai')
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('tab', { name: 'Quem vai' })).toHaveCount(0)
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

  await page.goto('/admin#admin-quem-vai')
  await expect(page.getByRole('tab', { name: 'Quem vai' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const panel = page.getByRole('tabpanel', { name: 'Quem vai' })
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
