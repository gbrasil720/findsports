import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Hoje na casa" (`/admin`): a noite, quem vai e quem chegou (lista do Elite),
// a oferta da casa, o "Desempenho do bar" dos últimos 30 dias e o card do plano.

/** O dia da casa vira às 6h de Brasília, como na tela. */
const DIA = new Date(Date.now() - 6 * 3_600_000).toLocaleDateString('sv-SE', {
  timeZone: 'America/Sao_Paulo'
})
const noite = (hm: string) => new Date(`${DIA}T${hm}:00-03:00`)

/** Navegador às 21h do dia da casa, qualquer que seja a hora do CI. */
async function openHoje(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await page.clock.setFixedTime(noite('21:00'))
  await signIn(page, pub.user)
  return pub
}

/** O balcão validou o código da reserva em `usedAt`. */
async function validate(reservationId: string, usedAt: Date) {
  const [code] = await query<{ id: string }>(
    'SELECT id FROM reservation_code WHERE reservation_id = $1',
    [reservationId]
  )
  await insert('reservation_code_use', {
    id: randomUUID(),
    code_id: code?.id,
    used_at: usedAt
  })
}

const kpi = (page: Page, rotulo: string) =>
  page
    .getByRole('region', { name: 'Números de hoje' })
    .locator('> *')
    .filter({ hasText: rotulo })
const desempenho = (page: Page) =>
  page.getByRole('region', { name: 'Desempenho do bar' })
const plano = (page: Page) => page.getByRole('region', { name: 'Seu plano' })

test('Elite: a noite, quem vai, quem chegou e a oferta da casa', async ({
  page
}) => {
  const pub = await openHoje(page, { bar: { house_offer: 'Chopp em dobro' } })
  const live = await createEvent(pub.barId, { startsAt: noite('20:45') })
  const later = await createEvent(pub.barId, { startsAt: noite('22:30') })
  // Fim longo: a lista de quem vai só traz jogo com a validação aberta, e o
  // CI pode rodar de madrugada.
  await query('UPDATE event SET ends_at = $2 WHERE id = $1', [
    live.eventId,
    noite('23:59')
  ])
  const arrived = await createTicket(live.eventId, {
    offerSnapshot: 'Chopp em dobro'
  })
  await createTicket(live.eventId)
  await createTicket(later.eventId)
  await validate(arrived.reservationId, noite('20:50'))

  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: 'Hoje na casa' })
  ).toBeVisible()
  await expect(
    page.getByText('2 jogos · 3 vão assistir · 1 já chegou')
  ).toBeVisible()
  await expect(kpi(page, 'jogos hoje')).toContainText('2')
  await expect(kpi(page, 'vão assistir hoje')).toContainText('3')
  await expect(kpi(page, 'códigos validados')).toContainText('1')

  const jogos = page.getByRole('list', { name: 'Jogos de hoje' })
  const aoVivo = jogos
    .getByRole('listitem')
    .filter({ hasText: live.championship })
  await expect(aoVivo).toContainText('Ao vivo')
  await expect(aoVivo).toContainText('20:45 · 2 vão · 1 chegou')
  await expect(
    jogos.getByRole('listitem').filter({ hasText: later.championship })
  ).toContainText('22:30 · 1 vai · 0 chegaram')

  const chegaram = page.getByRole('region', { name: 'Chegaram agora' })
  await expect(chegaram).toContainText('1 validado')
  await expect(chegaram.getByRole('listitem')).toHaveCount(1)
  await expect(chegaram.getByRole('listitem')).toContainText(arrived.guestName)
  await expect(chegaram.getByRole('listitem')).toContainText('20:50')
  await expect(chegaram.getByRole('listitem')).toContainText('Oferta liberada')

  await expect(desempenho(page)).toContainText('Pessoas que viram seu bar')
  await expect(desempenho(page)).toContainText('Taxa de interesse')
  await expect(
    desempenho(page).getByRole('link', { name: 'Ver desempenho →' })
  ).toHaveAttribute('href', '/admin/desempenho')
  await expect(plano(page)).toContainText('Elite')
  await expect(plano(page)).toContainText('Ativo')
  await expect(
    plano(page).getByRole('link', { name: 'Plano e cobrança →' })
  ).toHaveAttribute('href', '/admin/billing')

  // Desligar apaga o texto no servidor; religar na mesma visita o devolve.
  const oferta = page.getByRole('switch', { name: 'Oferta da casa' })
  await expect(oferta).toHaveAttribute('aria-checked', 'true')
  await oferta.click()
  await expect(oferta).toHaveAttribute('aria-checked', 'false')
  await expect
    .poll(async () => {
      const [bar] = await query<{ house_offer: string | null }>(
        'SELECT house_offer FROM bar WHERE id = $1',
        [pub.barId]
      )
      return bar?.house_offer
    })
    .toBeNull()
  await oferta.click()
  await expect(oferta).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(async () => {
      const [bar] = await query<{ house_offer: string | null }>(
        'SELECT house_offer FROM bar WHERE id = $1',
        [pub.barId]
      )
      return bar?.house_offer
    })
    .toBe('Chopp em dobro')
})

test('Elite: quem chegou é a primeira vez no bar ou a Nª no mês, e a oferta é a do código', async ({
  page
}) => {
  const pub = await openHoje(page, { bar: { house_offer: 'Chopp em dobro' } })
  const live = await createEvent(pub.barId, { startsAt: noite('20:45') })
  await query('UPDATE event SET ends_at = $2 WHERE id = $1', [
    live.eventId,
    noite('23:59')
  ])
  // Antes das 6h é a noite anterior da casa, mas o mesmo mês de Brasília.
  const earlier = await createEvent(pub.barId, {
    startsAt: new Date(`${DIA}T05:00:00-03:00`)
  })
  const first = await createTicket(live.eventId, {
    offerSnapshot: 'Chopp em dobro'
  })
  await validate(first.reservationId, noite('20:50'))
  const before = await createTicket(earlier.eventId, {
    offerSnapshot: 'Chopp em dobro'
  })
  await validate(before.reservationId, new Date(`${DIA}T05:30:00-03:00`))
  // Volta hoje com código sem oferta: o bar ter oferta agora não a libera.
  const again = await createTicket(live.eventId, { fan: before.fan })
  await validate(again.reservationId, noite('20:55'))

  await page.goto('/admin')
  const chegadas = page
    .getByRole('region', { name: 'Chegaram agora' })
    .getByRole('listitem')
  await expect(chegadas).toHaveCount(2)
  await expect(chegadas.nth(0)).toContainText(before.guestName)
  await expect(chegadas.nth(0)).toContainText('20:55 · 2ª vez no mês')
  await expect(chegadas.nth(0)).toContainText('✓ Validado')
  await expect(chegadas.nth(1)).toContainText(first.guestName)
  await expect(chegadas.nth(1)).toContainText('20:50 · primeira vez no bar')
  await expect(chegadas.nth(1)).toContainText('✓ Oferta liberada')
})

test('Chegaram agora a 320 px: nome numa linha e o selo embaixo do texto', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const pub = await openHoje(page)
  const live = await createEvent(pub.barId, { startsAt: noite('20:45') })
  await query('UPDATE event SET ends_at = $2 WHERE id = $1', [
    live.eventId,
    noite('23:59')
  ])
  const fan = await createUser({
    name: 'Aleksandra Wiśniewska-Kowalczyk de Albuquerque'
  })
  const ticket = await createTicket(live.eventId, {
    fan,
    offerSnapshot: 'Chopp em dobro'
  })
  await validate(ticket.reservationId, noite('20:50'))

  await page.goto('/admin')
  const chegada = page
    .getByRole('region', { name: 'Chegaram agora' })
    .getByRole('listitem')
  const nome = chegada.locator('b')
  const linha = chegada.getByText('20:50 · primeira vez no bar')
  const selo = chegada.getByText('✓ Oferta liberada')
  await expect(linha).toBeVisible()
  const [n, l, s] = await Promise.all(
    [nome, linha, selo].map(async (el) => await el.boundingBox())
  )
  // Uma linha de nome (14,5 px), e o selo começa abaixo de "hora · vez".
  expect(n?.height).toBeLessThan(25)
  expect(s?.y ?? 0).toBeGreaterThanOrEqual((l?.y ?? 0) + (l?.height ?? 0))
})

test('Pro: sem a lista do Elite, nada de contagem de quem vai', async ({
  page
}) => {
  const pub = await openHoje(page, { subscription: { plan: 'pro' } })
  const { eventId, championship } = await createEvent(pub.barId, {
    startsAt: noite('21:30')
  })
  // Fora do Elite quem marca não ganha código: só a presença.
  const fan = await createUser()
  await insert('attendance', { user_id: fan.id, event_id: eventId })

  await page.goto('/admin')
  await expect(page.getByText('1 jogo', { exact: true })).toBeVisible()
  await expect(kpi(page, 'vão assistir hoje')).toContainText('—')
  await expect(
    kpi(page, 'vão assistir hoje').getByRole('link', { name: 'Elite' })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(
    page
      .getByRole('list', { name: 'Jogos de hoje' })
      .getByRole('listitem')
      .filter({ hasText: championship })
  ).toContainText('21:30')
  await expect(
    page.getByRole('region', { name: 'Chegaram agora' })
  ).toHaveCount(0)
  await expect(
    page.getByRole('switch', { name: 'Oferta da casa' })
  ).toHaveCount(0)
  await expect(desempenho(page)).toContainText('Se interessaram')
  // A atividade diária pequena é de todos os planos (WEB-449).
  await expect(desempenho(page).locator('.hoje-mini')).toBeVisible()
  await expect(plano(page)).toContainText('Pro')
})

test('interesse de hoje contra o normal do mesmo dia da semana (1r)', async ({
  page
}) => {
  const pub = await openHoje(page, {
    subscription: { plan: 'pro' },
    bar: { created_at: new Date(Date.now() - 60 * 86_400_000) }
  })
  const inicio = new Date(`${DIA}T00:00:30-03:00`).getTime()
  const interesse = async (semanasAtras: number) => {
    const fan = await createUser()
    const at = new Date(inicio - semanasAtras * 7 * 86_400_000)
    await insert('bar_commercial_event', {
      id: randomUUID(),
      bar_id: pub.barId,
      actor_user_id: fan.id,
      type: 'whatsapp_opened',
      occurred_at: at,
      commercial_day: at.toLocaleDateString('sv-SE', {
        timeZone: 'America/Sao_Paulo'
      })
    })
  }
  // Hoje 2 pessoas; uma em cada um dos quatro mesmos dias de antes.
  for (const semanasAtras of [0, 0, 1, 2, 3, 4]) await interesse(semanasAtras)
  const dia = [
    'domingo',
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado'
  ][new Date(`${DIA}T12:00:00Z`).getUTCDay()]

  await page.goto('/admin')
  const card = kpi(page, 'do seu normal de')
  await expect(card).toContainText('+100%')
  await expect(card).toContainText(`interesse acima do seu normal de ${dia}`)
  await expect(card).not.toContainText('em breve')
})

test('Starter sem jogo hoje: noite vazia, quem viu o bar e "Novo jogo"', async ({
  page
}) => {
  const pub = await openHoje(page, { subscription: { plan: 'starter' } })
  const fan = await createUser()
  await insert('bar_commercial_event', {
    id: randomUUID(),
    bar_id: pub.barId,
    actor_user_id: fan.id,
    type: 'profile_view',
    occurred_at: noite('12:00'),
    commercial_day: DIA
  })

  await page.goto('/admin')
  await expect(page.getByText('Nenhum jogo marcado para hoje.')).toBeVisible()
  await expect(desempenho(page).getByRole('listitem').first()).toContainText(
    'Pessoas que viram seu bar1'
  )
  await expect(desempenho(page).locator('.hoje-mini')).toBeVisible()
  // Bar novo, sem quatro semanas de história: ainda não há "normal".
  await expect(kpi(page, 'do seu normal de')).toContainText('—')
  await expect(plano(page)).toContainText('0 de 5 jogos usados neste ciclo')
  // O aviso do Starter dentro do limite é de Jogos, não de Hoje.
  await expect(
    page.getByRole('region', { name: 'Aviso do plano' })
  ).toHaveCount(0)

  await page.getByRole('link', { name: 'Novo jogo' }).click()
  await expect(page).toHaveURL(/\/admin\/jogos\?novo=1$/)
})

test('A noite arrasta para ver amanhã, com o mouse e pelas setas', async ({
  page,
  isMobile
}) => {
  const pub = await openHoje(page, { subscription: { plan: 'pro' } })
  const { championship } = await createEvent(pub.barId, {
    startsAt: new Date(noite('21:00').getTime() + 24 * 3_600_000)
  })

  await page.goto('/admin')
  await expect(
    page.getByText('18h → 2h · arraste para ver amanhã')
  ).toBeVisible()
  const amanha = page
    .getByRole('list', { name: 'Jogos de amanhã' })
    .getByRole('listitem')
    .filter({ hasText: championship })
  await expect(amanha).toContainText('21:00')
  await expect(amanha).not.toBeInViewport()

  const linha = page.getByRole('region', {
    name: /A noite, de hoje até amanhã/
  })
  if (!isMobile) {
    const caixa = await linha.boundingBox()
    if (!caixa) throw new Error('linha do tempo sem caixa')
    await page.mouse.move(caixa.x + caixa.width - 10, caixa.y + 60)
    await page.mouse.down()
    await page.mouse.move(caixa.x + 10, caixa.y + 60, { steps: 8 })
    await page.mouse.up()
    await expect(amanha).toBeInViewport()
  }

  await linha.press('Home')
  await expect(amanha).not.toBeInViewport()
  await linha.press('End')
  await expect(amanha).toBeInViewport()
})

test('a noite: o AGORA fica abaixo da hora, sem cobrir o rótulo (1j)', async ({
  page
}) => {
  const pub = await createPub()
  await createEvent(pub.barId, { startsAt: noite('20:45') })
  await page.clock.setFixedTime(noite('21:52'))
  await signIn(page, pub.user)
  await page.goto('/admin')

  const agora = page.getByText('AGORA 21:52')
  // A primeira: a de amanhã também diz "21h".
  const hora = page.locator('.hoje-horas span', { hasText: /^21h$/ }).first()
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 })
    await agora.scrollIntoViewIfNeeded()
    const [a, h] = await Promise.all([agora.boundingBox(), hora.boundingBox()])
    if (!a || !h) throw new Error('AGORA ou a hora não apareceu')
    const cruza =
      a.x < h.x + h.width &&
      h.x < a.x + a.width &&
      a.y < h.y + h.height &&
      h.y < a.y + a.height
    expect(cruza, `${largura} px`).toBe(false)
  }
})
