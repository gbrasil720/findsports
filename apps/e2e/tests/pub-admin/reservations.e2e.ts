import type { Browser, Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import { createEvent, createReservation } from '../../fixtures/reservations'
import { expect, test } from '../../fixtures/test'

// Fila de pedidos de reserva (WEB-125): bar Elite com recebimento ligado
// confirma ou recusa cada pedido.

async function openQueue(page: Page) {
  const pub = await createPub({ bar: { accepts_reservations: true } })
  const { eventId } = await createEvent(pub.barId)
  await signIn(page, pub.user)
  return { ...pub, eventId }
}

const statusOf = async (reservationId: string) =>
  (
    await query<{ status: string }>(
      'SELECT status FROM reservation WHERE id = $1',
      [reservationId]
    )
  )[0]?.status

test('confirma um pedido e recusa outro, com confirmação da recusa', async ({
  page
}) => {
  const { eventId } = await openQueue(page)
  const accept = await createReservation(eventId, {
    status: 'pending',
    partySize: 3
  })
  const decline = await createReservation(eventId, { status: 'pending' })
  await page.goto('/admin#admin-reservas')
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  const acceptCard = page.getByRole('article', {
    name: `${accept.guestName} · 3 pessoas`
  })
  await expect(acceptCard).toContainText('Pendente')
  await acceptCard.getByRole('button', { name: 'Confirmar reserva' }).click()
  await expect(acceptCard).toContainText('Confirmada')
  await expect(
    acceptCard.getByRole('button', { name: 'Confirmar reserva' })
  ).toHaveCount(0)
  expect(await statusOf(accept.reservationId)).toBe('confirmed')

  const declineCard = page.getByRole('article', {
    name: new RegExp(decline.guestName)
  })
  await declineCard.getByRole('button', { name: 'Recusar' }).click()
  // Recusar pede um segundo toque; "Voltar" desiste.
  await declineCard.getByRole('button', { name: 'Voltar' }).click()
  expect(await statusOf(decline.reservationId)).toBe('pending')
  await declineCard.getByRole('button', { name: 'Recusar' }).click()
  await declineCard.getByRole('button', { name: 'Confirmar recusa' }).click()
  await expect(declineCard).toContainText('Recusada')
  expect(await statusOf(decline.reservationId)).toBe('declined')
})

test('sem pedidos, a aba diz que está vazia', async ({ page }) => {
  await openQueue(page)
  await page.goto('/admin#admin-reservas')
  await expect(page.getByText('Nenhum pedido por enquanto.')).toBeVisible()
})

test('link direto para Reservas sem Elite cai na Visão geral', async ({
  page
}) => {
  const pub = await createPub({
    subscription: { plan: 'pro' },
    bar: { accepts_reservations: true }
  })
  await signIn(page, pub.user)
  await page.goto('/admin#admin-reservas')
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveCount(0)
})

/** O perfil do bar como o torcedor da sessão pronta vê, numa aba própria. */
async function fanSeesPub(browser: Browser, barId: string) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: storageState('fan')
  })
  const fanPage = await context.newPage()
  await fanPage.goto(`/pub/${barId}`)
  await fanPage.locator('html[data-hydrated]').waitFor({ state: 'attached' })
  return { fanPage, close: () => context.close() }
}

test('teto do jogo fecha pedidos novos, e o torcedor vê o esgotado', async ({
  page,
  browser
}) => {
  const { barId, eventId } = await openQueue(page)
  await createReservation(eventId, { partySize: 2 })

  const before = await fanSeesPub(browser, barId)
  await expect(
    before.fanPage.getByRole('button', { name: 'Reservar mesa' }).first()
  ).toBeVisible()
  await before.close()

  await page.goto('/admin#admin-reservas')
  const caps = page.getByRole('region', { name: 'Teto por jogo' })
  await expect(caps).toContainText('2 lugares confirmados, sem teto')

  // Teto padrão do bar, depois o teto do jogo, que vence o padrão.
  await caps.getByLabel('Padrão do bar').fill('10')
  await caps.getByRole('button', { name: 'Salvar' }).first().click()
  await expect(caps).toContainText('2 de 10 lugares confirmados')

  await caps.getByLabel('Teto deste jogo').fill('2')
  await caps.getByRole('button', { name: 'Salvar' }).nth(1).click()
  await expect(caps).toContainText(
    '2 de 2 lugares confirmados · pedidos fechados'
  )

  const [saved] = await query(
    `SELECT b.reservation_cap AS bar_cap, e.reservation_cap AS game_cap
     FROM event e JOIN bar b ON b.id = e.bar_id WHERE e.id = $1`,
    [eventId]
  )
  expect(saved).toEqual({ bar_cap: 10, game_cap: 2 })

  const after = await fanSeesPub(browser, barId)
  await expect(
    after.fanPage
      .getByRole('button', { name: /Reservas esgotadas para este jogo/ })
      .first()
  ).toBeDisabled()
  await expect(
    after.fanPage.getByRole('button', { name: 'Reservar mesa' })
  ).toHaveCount(0)
  await after.close()
})

test('teto vai até 5000: acima disso a tela barra e o servidor recusa', async ({
  page
}) => {
  const { barId } = await openQueue(page)
  await page.goto('/admin#admin-reservas')
  const caps = page.getByRole('region', { name: 'Teto por jogo' })

  await caps.getByLabel('Padrão do bar').fill('5001')
  await caps.getByRole('button', { name: 'Salvar' }).first().click()
  // A tela recusa com o próprio texto, sem o balão do navegador (WEB-272).
  await expect(caps.getByRole('alert')).toHaveText(
    'Informe um número inteiro de 1 a 5000, ou deixe o campo vazio.'
  )
  const [untouched] = await query(
    'SELECT reservation_cap FROM bar WHERE id = $1',
    [barId]
  )
  expect(untouched?.reservation_cap).toBeNull()

  const tooBig = await page.request.post(
    '/api/trpc/barReservations.setDefaultCap',
    { data: { reservationCap: 5001 } }
  )
  expect(tooBig.status()).toBe(400)

  await caps.getByLabel('Padrão do bar').fill('5000')
  await caps.getByRole('button', { name: 'Salvar' }).first().click()
  await expect
    .poll(async () => {
      const [bar] = await query(
        'SELECT reservation_cap FROM bar WHERE id = $1',
        [barId]
      )
      return bar?.reservation_cap
    })
    .toBe(5000)
})

// WEB-341: o trial vence com reserva confirmada em aberto. O bar não recebe
// pedido novo, mas ainda vê e valida o que já aceitou.
test('trial Elite vencido com reserva confirmada: a aba Reservas fica, o código valida e o perfil para de anunciar reserva', async ({
  page,
  browser
}) => {
  const pub = await createPub({
    subscription: { status: 'trialing', currentPeriodEnd: inDays(-1) },
    // 1 = "Telão / projetor", 10 = "Aceita reserva".
    bar: { accepts_reservations: true, amenities: [1, 10] }
  })
  const { eventId } = await createEvent(pub.barId)
  const confirmed = await createReservation(eventId, {
    offerSnapshot: 'Chopp em dobro'
  })
  await signIn(page, pub.user)

  await page.goto('/admin#admin-reservas')
  await expect(page.getByRole('tab', { name: 'Reservas' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const panel = page.getByRole('tabpanel', { name: 'Reservas' })
  await expect(panel.getByRole('note')).toContainText(
    'Seu bar não está recebendo pedidos novos'
  )
  const card = panel.getByRole('article', {
    name: new RegExp(confirmed.guestName)
  })
  await expect(card).toContainText('Confirmada')
  await expect(card).toContainText('Chopp em dobro')
  // O teto é recurso do plano: sem Elite, não aparece.
  await expect(page.getByRole('region', { name: 'Teto por jogo' })).toHaveCount(
    0
  )

  await page.goto('/admin/validate')
  await page.getByLabel('Código', { exact: true }).fill(confirmed.code)
  await page.getByRole('button', { name: 'Buscar reserva' }).click()
  await expect(
    page.getByRole('heading', { name: `Reserva de ${confirmed.guestName}` })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Registrar chegada (+1)' }).click()
  await page
    .getByRole('dialog', { name: 'Registrar chegada?' })
    .getByRole('button', { name: 'Confirmar chegada' })
    .click()
  await expect(
    page.getByText('Chegada registrada. 1 de 2 validados.')
  ).toBeVisible()

  const fan = await fanSeesPub(browser, pub.barId)
  await expect(fan.fanPage.getByText('Telão / projetor')).toBeVisible()
  await expect(fan.fanPage.getByText('Aceita reserva')).toHaveCount(0)
  await expect(
    fan.fanPage.getByRole('button', { name: 'Reservar mesa' })
  ).toHaveCount(0)
  await fan.close()
})
