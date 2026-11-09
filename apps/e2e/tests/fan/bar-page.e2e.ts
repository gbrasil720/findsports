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

// Página pública do bar, `/bar/$slug` (WEB-501): aberta sem login, o que grava
// pede login pela folha da própria página e volta com a ação feita.

/** O endereço canônico, como `barPath` (`packages/db/src/bar-slug.ts`). */
const barUrl = (name: string, neighborhood: string, barId: string) =>
  `/bar/${`${name} ${neighborhood}`
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}-${barId.slice(0, 8)}`

/** O cartão do jogo: ao lado no desktop, logo abaixo da capa no celular. */
const card = (page: Page) => page.locator('#today')

const attendanceOf = (userId: string, eventId: string) =>
  query('SELECT 1 FROM attendance WHERE user_id = $1 AND event_id = $2', [
    userId,
    eventId
  ]).then((rows) => rows.length)

async function codeOf(userId: string, eventId: string) {
  const [row] = await query<{ code: string }>(
    `SELECT c.code
       FROM reservation r JOIN reservation_code c ON c.reservation_id = r.id
      WHERE r.user_id = $1 AND r.event_id = $2 AND c.retired_at IS NULL`,
    [userId, eventId]
  )
  return row?.code
}

const intents = (fanId: string, barId: string) =>
  query<{ type: string }>(
    'SELECT type FROM bar_commercial_event WHERE actor_user_id = $1 AND bar_id = $2 ORDER BY type',
    [fanId, barId]
  ).then((rows) => rows.map((row) => row.type))

test.describe('deslogado', () => {
  test('/pub/<id> leva com 301 ao endereço com o nome, que abre sem login', async ({
    page,
    request
  }) => {
    const spot = uniqueSpot()
    const pub = await pubAt(spot, { bar: { neighborhood: 'Vila Madalena' } })
    const freeText = `Aberto ${randomUUID().slice(0, 6)}`
    await createEvent({ barId: pub.barId, startsAt: days(1), freeText })
    const path = barUrl(pub.name, 'Vila Madalena', pub.barId)

    const old = await request.get(`/pub/${pub.barId}`, { maxRedirects: 0 })
    expect(old.status()).toBe(301)
    expect(old.headers().location).toContain(path)
    // Nome desatualizado no link: o mesmo bar, com 301 para o atual.
    const renamed = await request.get(
      `/bar/nome-antigo-${pub.barId.slice(0, 8)}`,
      { maxRedirects: 0 }
    )
    expect(renamed.status()).toBe(301)
    expect(renamed.headers().location).toContain(path)

    // O HTML do servidor já traz o jogo, a canônica e o JSON-LD.
    const html = await (await request.get(path)).text()
    expect(html).toContain(`<link rel="canonical" href="`)
    expect(html).toContain('"@type":"BarOrPub"')
    expect(html).toContain(`${freeText} no ${pub.name}`)
    expect(html).toContain('content="index, follow"')

    await page.goto(`/pub/${pub.barId}`)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(
      page.getByRole('heading', { level: 1, name: pub.name })
    ).toBeVisible()
    await expect(card(page)).toContainText(freeText)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('"Vou assistir aqui" abre a folha de login e volta com a presença marcada', async ({
    page
  }) => {
    const spot = uniqueSpot()
    const pub = await pubAt(spot, {
      bar: { house_offer: 'Porção de fritas no intervalo' }
    })
    const freeText = `Folha ${randomUUID().slice(0, 6)}`
    const eventId = await createEvent({
      barId: pub.barId,
      startsAt: days(2),
      freeText
    })
    const fan = await createUser()

    await page.goto(`/pub/${pub.barId}`)
    await card(page).getByRole('button', { name: 'Vou assistir aqui' }).click()
    const sheet = page.getByRole('dialog', {
      name: 'Entre para marcar presença'
    })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText(freeText)
    // Criar conta leva a ação junto, para a volta do cadastro.
    await expect(
      sheet.getByRole('link', { name: 'Criar conta grátis' })
    ).toHaveAttribute(
      'href',
      new RegExp(`callbackUrl=.*jogo%3D${eventId}.*acao%3Dvou`)
    )

    await sheet.getByLabel('E-mail').fill(fan.email)
    await sheet.getByLabel('Senha', { exact: true }).fill(fan.password)
    await sheet
      .getByRole('button', { name: 'Entrar e marcar presença' })
      .click()

    await expect(sheet).toHaveCount(0)
    await expect(card(page)).toContainText('VOCÊ VAI')
    await expect.poll(() => attendanceOf(fan.id, eventId)).toBe(1)
    await expect.poll(() => codeOf(fan.id, eventId)).toMatch(/^[A-Z0-9]{6}$/)
    const code = (await codeOf(fan.id, eventId)) as string
    await expect(card(page)).toContainText(
      `${code.slice(0, 3)} ${code.slice(3)}`
    )
    // A ação sai da URL: recarregar não marca de novo.
    await expect(page).not.toHaveURL(/acao=/)

    // O código grande, com o QR que o balcão lê.
    await card(page)
      .getByRole('button', { name: 'Mostrar código no balcão' })
      .click()
    const modal = page.getByRole('dialog', { name: 'Mostre no balcão' })
    await expect(modal).toContainText('Porção de fritas no intervalo')
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)

    await card(page).getByRole('button', { name: 'Não vou mais' }).click()
    await expect.poll(() => attendanceOf(fan.id, eventId)).toBe(0)
    await expect(
      card(page).getByRole('button', { name: 'Vou assistir aqui' })
    ).toBeVisible()
  })

  test('link sem bar é 404; bar fora do ar é 200 com noindex', async ({
    page,
    request
  }) => {
    expect((await request.get(`/pub/${randomUUID()}`)).status()).toBe(404)
    expect((await request.get('/bar/nao-existe-zzzzzzzz')).status()).toBe(404)
    const missing = await request.get(`/bar/nada-${randomUUID().slice(0, 8)}`)
    expect(missing.status()).toBe(404)
    expect(await missing.text()).toContain('noindex')

    const off = await createPub({ bar: { is_active: false } })
    const res = await request.get(`/pub/${off.barId}`)
    expect(res.status()).toBe(200)
    const html = await res.text()
    expect(html).toContain('content="noindex"')
    expect(html).not.toContain('BarOrPub')

    await page.goto(`/pub/${off.barId}`)
    await expect(
      page.getByRole('heading', { level: 1, name: /Este bar saiu/ })
    ).toBeVisible()

    // O dono continua vendo a prévia do próprio bar.
    await signIn(page, off.user)
    await page.goto(`/pub/${off.barId}`)
    await expect(
      page.getByText('Prévia: o seu bar está fora do ar')
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: `Bar E2E ${off.barId.slice(0, 8)}`
      })
    ).toBeVisible()
  })
})

test('torcedor salva o bar e cada contato registra a intenção', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, {
    bar: { phone: '11987654321', phone_accepts_whatsapp: true }
  })
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  const save = page.getByRole('button', { name: `Salvar o ${pub.name}` })
  await save.click()
  await expect(
    page.getByRole('button', { name: 'Salvo em Seus bares' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => isFavorite(fan.id, pub.barId)).toBe(true)

  const where = page.getByRole('region', { name: 'Onde fica' })
  const whatsapp = where.locator('a[href^="https://wa.me/5511987654321"]')
  const directions = where.locator('a[href*="google.com/maps"]')
  const phone = where.locator('a[href="tel:11987654321"]')
  for (const link of [whatsapp, directions]) {
    const popup = page.waitForEvent('popup')
    await link.press('Enter')
    await (await popup).close()
  }
  await page.evaluate(
    `document.addEventListener("click", (event) => {
      if (event.target.closest('a[href^="tel:"]')) event.preventDefault()
    }, true)`
  )
  await phone.press('Enter')
  await expect
    .poll(() => intents(fan.id, pub.barId))
    .toEqual(
      expect.arrayContaining([
        'directions_opened',
        'phone_clicked',
        'profile_view',
        'whatsapp_opened'
      ])
    )
})

test('jogo começado não marca presença; oferta só no Elite', async ({
  page
}) => {
  const spot = uniqueSpot()
  const elite = await pubAt(spot, { bar: { house_offer: 'Chopp em dobro' } })
  const live = `Ao vivo ${randomUUID().slice(0, 6)}`
  await createEvent({
    barId: elite.barId,
    startsAt: hours(-0.5),
    endsAt: hours(1.5),
    freeText: live
  })
  const pro = await pubAt(spot, {
    subscription: { plan: 'pro' },
    bar: { house_offer: 'Oferta guardada' }
  })
  await createEvent({ barId: pro.barId, startsAt: days(2) })
  await signInFanAt(page, spot)

  await page.goto(`/pub/${elite.barId}`)
  await expect(card(page)).toContainText('AO VIVO')
  await expect(card(page)).toContainText('O jogo já começou')
  await expect(
    card(page).getByRole('button', { name: 'Vou assistir aqui' })
  ).toHaveCount(0)
  await expect(card(page)).toContainText('Chopp em dobro')

  await page.goto(`/pub/${pro.barId}`)
  await expect(
    card(page).getByRole('button', { name: 'Vou assistir aqui' })
  ).toBeVisible()
  await expect(page.getByText('Oferta guardada')).toHaveCount(0)
})

test('sem jogo marcado: o estado vazio e o salvar pede login', async ({
  page
}) => {
  const pub = await createPub()
  await page.goto(`/pub/${pub.barId}`)
  await expect(
    card(page).getByRole('heading', { name: 'Sem jogo marcado' })
  ).toBeVisible()
  await card(page).getByRole('button', { name: 'Salvar o bar' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Entre para salvar o bar' })
  ).toBeVisible()
})

// Um formato de ação só (`?acao=<tipo>.<id>`, `components/torcedor/acao.ts`),
// e o antigo da página do bar (`?acao=vou` com `?jogo=`, `?acao=salvar`)
// segue valendo para os links já mandados. A ação vai no `callbackUrl` do
// login e volta concluída.
test.describe('ação pela URL depois do login', () => {
  async function entrarPeloLogin(
    page: Page,
    fan: { email: string; password: string },
    destino: string
  ) {
    await page.goto(`/login?callbackUrl=${encodeURIComponent(destino)}`)
    await page.getByLabel('E-mail').fill(fan.email)
    await page.getByLabel('Senha', { exact: true }).fill(fan.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  }

  async function barComJogo() {
    const pub = await pubAt(uniqueSpot(), {
      bar: { neighborhood: 'Vila Madalena' }
    })
    const eventId = await createEvent({ barId: pub.barId, startsAt: days(2) })
    return {
      ...pub,
      eventId,
      path: barUrl(pub.name, 'Vila Madalena', pub.barId)
    }
  }

  test('formato antigo: ?acao=vou com o jogo e ?acao=salvar', async ({
    page
  }) => {
    const bar = await barComJogo()
    const fan = await createUser()

    await entrarPeloLogin(page, fan, `${bar.path}?jogo=${bar.eventId}&acao=vou`)
    await expect.poll(() => attendanceOf(fan.id, bar.eventId)).toBe(1)
    await expect(card(page)).toContainText('VOCÊ VAI')
    await expect(page).not.toHaveURL(/acao=/)

    await page.goto(`${bar.path}?acao=salvar`)
    await expect.poll(() => isFavorite(fan.id, bar.barId)).toBe(true)
    await expect(page).not.toHaveURL(/acao=/)
  })

  test('formato novo: vou.<jogo> no bar e fav.<bar> pelo /pub antigo', async ({
    page
  }) => {
    const bar = await barComJogo()
    const fan = await createUser()

    await entrarPeloLogin(
      page,
      fan,
      `${bar.path}?jogo=${bar.eventId}&acao=vou.${bar.eventId}`
    )
    await expect.poll(() => attendanceOf(fan.id, bar.eventId)).toBe(1)
    await expect(page).not.toHaveURL(/acao=/)

    await page.goto(`/pub/${bar.barId}?acao=fav.${bar.barId}`)
    await expect(page).toHaveURL(new RegExp(bar.path))
    await expect.poll(() => isFavorite(fan.id, bar.barId)).toBe(true)
    await expect(page).not.toHaveURL(/acao=/)
  })

  // WEB-501: a ação primeiro, as preferências depois (`conta-nova.e2e.ts`).
  test('torcedor sem onboarding: a ação sai antes, e o card leva às preferências', async ({
    page
  }) => {
    const bar = await barComJogo()
    const fan = await createUser({ onboardingCompleted: false })

    await entrarPeloLogin(page, fan, `${bar.path}?acao=fav.${bar.barId}`)
    await expect(page).toHaveURL(
      /\/dashboard\/seus-bares\?aba=salvos&novo=fav$/
    )
    await expect.poll(() => isFavorite(fan.id, bar.barId)).toBe(true)
    await expect(page.locator('section.fresh')).toContainText(
      'Conta criada e bar salvo'
    )
  })
})
