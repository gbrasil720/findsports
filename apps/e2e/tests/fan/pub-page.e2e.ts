import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import {
  createEvent,
  days,
  hours,
  isFavorite,
  pubAt,
  signInFanAt,
  uniqueSpot
} from '../../fixtures/fan'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Página pública do bar, `/pub/$pubId` (WEB-178).

/** "Garanta seu lugar": o painel de ações (no celular há também a barra fixa). */
const actionsPanel = (page: Page) =>
  page.locator('section', { hasText: 'Garanta seu lugar' })

const intents = (fanId: string, barId: string) =>
  query<{ type: string }>(
    'SELECT type FROM bar_commercial_event WHERE actor_user_id = $1 AND bar_id = $2 ORDER BY type',
    [fanId, barId]
  ).then((rows) => rows.map((row) => row.type))

test.describe('deslogado', () => {
  test('diálogo de login é obrigatório e não fecha', async ({ page }) => {
    const { barId } = await createPub()

    await page.goto(`/pub/${barId}`)
    const dialog = page.getByRole('dialog', {
      name: 'Autenticação obrigatória'
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Acesso exclusivo')).toBeVisible()

    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      new RegExp(`callbackUrl=.*${barId}`)
    )
    await expect(
      dialog.getByRole('link', { name: 'Criar conta grátis' })
    ).toHaveAttribute('href', new RegExp(`callbackUrl=.*${barId}`))
  })

  // WEB-182: o diálogo manda `callbackUrl` relativo.
  test('login a partir do diálogo volta para a página do bar', async ({
    page
  }) => {
    const { barId } = await createPub()
    const fan = await createUser()

    await page.goto(`/pub/${barId}`)
    await page.getByRole('link', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.getByLabel('E-mail').fill(fan.email)
    await page.getByLabel('Senha', { exact: true }).fill(fan.password)
    await page.getByRole('button', { name: 'Acessar minha conta' }).click()

    await expect(page).toHaveURL(new RegExp(`/pub/${barId}$`))
  })
})

test('torcedor favorita e vê oferta, cardápio e contatos', async ({ page }) => {
  const spot = uniqueSpot()
  const menuUrl = `https://cardapio.example.com/${randomUUID()}`
  const pub = await pubAt(spot, {
    bar: {
      house_offer: 'Chopp em dobro no intervalo',
      menu_url: menuUrl,
      phone: '11987654321',
      phone_accepts_whatsapp: true,
      accepts_reservations: true
    }
  })
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  await expect(
    page.getByRole('heading', { level: 1, name: pub.name })
  ).toBeVisible()

  // Favoritar
  await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click()
  await expect(
    page.getByRole('button', { name: 'Remover dos favoritos' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => isFavorite(fan.id, pub.barId)).toBe(true)

  // Oferta da casa (Elite recebendo reservas) e cardápio (Pro/Elite)
  const offer = page.getByRole('region', { name: 'Oferta da casa' })
  await expect(offer).toContainText('Chopp em dobro no intervalo')
  await expect(page.locator(`a[href="${menuUrl}"]`)).toBeVisible()

  // Contatos: WhatsApp, rota e telefone — cada clique registra a intenção
  const panel = actionsPanel(page)
  const whatsapp = panel.locator('a[href^="https://wa.me/5511987654321"]')
  const directions = panel.locator('a[href*="google.com/maps"]')
  const phone = panel.locator('a[href="tel:11987654321"]')
  await expect(whatsapp).toBeVisible()
  await expect(directions).toBeVisible()
  await expect(phone).toBeVisible()

  for (const link of [whatsapp, directions]) {
    const popup = page.waitForEvent('popup')
    await link.click()
    await (await popup).close()
  }
  // `tel:` abriria o discador; o handler do app roda antes do padrão. Em
  // string porque o tsconfig da suíte não carrega os tipos do DOM.
  await page.evaluate(
    `document.addEventListener("click", (event) => {
      if (event.target.closest('a[href^="tel:"]')) event.preventDefault()
    }, true)`
  )
  await phone.click()
  await expect
    .poll(() => intents(fan.id, pub.barId))
    .toEqual(
      expect.arrayContaining([
        'directions_opened',
        'phone_clicked',
        'whatsapp_opened'
      ])
    )
})

test('"Vou assistir aqui" só em jogo futuro', async ({ page }) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const future = `Futuro ${randomUUID().slice(0, 6)}`
  const live = `Ao vivo ${randomUUID().slice(0, 6)}`
  const futureId = await createEvent({
    barId: pub.barId,
    startsAt: days(2),
    freeText: future
  })
  await createEvent({
    barId: pub.barId,
    startsAt: hours(-0.5),
    endsAt: hours(1.5),
    freeText: live
  })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  await expect(page.getByText(live).first()).toBeVisible()
  await expect(page.getByRole('group', { name: live })).toHaveCount(0)

  const game = page.getByRole('group', { name: future })
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()
  await expect(
    game.getByText('Você vai assistir aqui', { exact: true })
  ).toBeVisible()
  await expect
    .poll(
      async () =>
        (
          await query(
            'SELECT 1 FROM attendance WHERE user_id = $1 AND event_id = $2',
            [fan.id, futureId]
          )
        ).length
    )
    .toBe(1)
})

test('reserva em bar Elite: 1 a 20 pessoas, observação e código', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { accepts_reservations: true } })
  const eventId = await createEvent({ barId: pub.barId, startsAt: days(3) })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  await actionsPanel(page)
    .getByRole('button', { name: 'Reservar mesa' })
    .click()

  const dialog = page.getByRole('dialog', { name: 'Reservar mesa' })
  const people = dialog.getByLabel('Quantas pessoas')
  const send = dialog.getByRole('button', { name: 'Enviar pedido' })
  await people.fill('21')
  await expect(people).toHaveAttribute('aria-invalid', 'true')
  await expect(send).toBeDisabled()
  await people.fill('0')
  await expect(send).toBeDisabled()
  await people.fill('4')
  await expect(send).toBeEnabled()
  await dialog.getByLabel('Observação (opcional)').fill('Mesa perto do telão')
  await send.click()

  const sent = page.getByRole('dialog', { name: 'Pedido enviado' })
  await expect(sent.getByText(/^[A-Z0-9]{6}$/)).toBeVisible()
  const [row] = await query<{
    party_size: number
    note: string
    status: string
  }>(
    'SELECT party_size, note, status FROM reservation WHERE user_id = $1 AND event_id = $2',
    [fan.id, eventId]
  )
  expect(row).toEqual({
    party_size: 4,
    note: 'Mesa perto do telão',
    status: 'pending'
  })
})

test('reserva não aparece fora do Elite ou com reservas desligadas', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pro = await pubAt(spot, {
    subscription: { plan: 'pro' },
    bar: { accepts_reservations: true }
  })
  const off = await pubAt(spot, { bar: { accepts_reservations: false } })
  await createEvent({ barId: pro.barId, startsAt: days(2) })
  await createEvent({ barId: off.barId, startsAt: days(2) })
  await signInFanAt(page, spot)

  for (const { barId, name } of [pro, off]) {
    await page.goto(`/pub/${barId}`)
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(actionsPanel(page)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Reservar mesa' })
    ).toHaveCount(0)
  }
})

test('dono vê o banner de pré-visualização, publicado ou não', async ({
  page
}) => {
  const active = await createPub()
  await signIn(page, active.user)
  await page.goto(`/pub/${active.barId}`)
  await expect(
    page.getByText('Você está vendo seu perfil como o torcedor vê')
  ).toBeVisible()

  const inactive = await createPub({ bar: { is_active: false } })
  await page.context().clearCookies()
  await signIn(page, inactive.user)
  await page.goto(`/pub/${inactive.barId}`)
  await expect(
    page.getByText('Prévia do seu perfil — ainda fora do ar')
  ).toBeVisible()
})

// O `getById` responde NOT_FOUND na hora, mas o React Query refaz a consulta
// três vezes (1 + 2 + 4 s) antes de a tela desistir: daí a espera longa.
for (const [label, barId] of [
  [
    'inativo',
    async () => (await createPub({ bar: { is_active: false } })).barId
  ],
  ['inexistente', async () => randomUUID()]
] as const) {
  test(`bar ${label} devolve o torcedor ao dashboard`, async ({ page }) => {
    const id = await barId()
    await signInFanAt(page, uniqueSpot())

    await page.goto(`/pub/${id}`)
    await expect(page.getByText('Bar não encontrado.')).toBeVisible({
      timeout: 20_000
    })
    await expect(page).toHaveURL(/\/dashboard$/)
  })
}
