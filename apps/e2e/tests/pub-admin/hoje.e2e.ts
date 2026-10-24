import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Hoje na casa" (`/admin`): a noite, quem vai e quem chegou (lista do Elite),
// a oferta da casa e a semana nas analytics de cada plano.

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

const kpi = (page: Page, rotulo: string) =>
  page
    .getByRole('region', { name: 'Números de hoje' })
    .locator('> *')
    .filter({ hasText: rotulo })
const semana = (page: Page) => page.getByRole('region', { name: 'Esta semana' })

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
  const arrived = await createTicket(live.eventId)
  await createTicket(live.eventId)
  await createTicket(later.eventId)
  const [code] = await query<{ id: string }>(
    'SELECT id FROM reservation_code WHERE reservation_id = $1',
    [arrived.reservationId]
  )
  await insert('reservation_code_use', {
    id: randomUUID(),
    code_id: code?.id,
    used_at: noite('20:50')
  })

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

  await expect(semana(page)).toContainText('códigos validados')
  await expect(semana(page)).toContainText('pediram rota')
  await expect(
    semana(page).getByRole('list', { name: 'Vão assistir por dia' })
  ).toBeVisible()

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
  await expect(semana(page)).toContainText('pediram rota')
  await expect(semana(page)).not.toContainText('códigos validados')
})

test('Starter sem jogo hoje: noite vazia, só aberturas na semana e "Novo jogo"', async ({
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
  await expect(semana(page).getByRole('listitem').first()).toContainText(
    '1viram o bar'
  )
  await expect(semana(page)).not.toContainText('pediram rota')
  await expect(semana(page)).toContainText('salvaram')

  await page.getByRole('link', { name: 'Novo jogo' }).click()
  await expect(page).toHaveURL(/\/admin\/jogos\?novo=1$/)
})
