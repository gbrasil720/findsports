import type { Page } from '@playwright/test'
import { query } from '../../fixtures/db'
import {
  createEvent,
  hours,
  isFavorite,
  north,
  pubAt,
  signInFanAt,
  team,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// O Explorar do web do torcedor (WEB-501): abre sem login, a régua escolhe o
// jogo e a lista mostra onde ele passa. Cada teste põe os bares num ponto
// próprio do mapa: a régua é por raio, então os testes paralelos não se veem.

/** O dia de Brasília de `date`, como a URL do Explorar (`?dia=`). */
const brasiliaDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    date
  )

const cartao = (page: Page, nome: string) =>
  page
    .locator('article.bc')
    .filter({ has: page.getByRole('heading', { name: nome }) })

/** Bar no ponto, com um jogo daqui a duas horas; o navegador fica nele. */
async function barComJogo(
  page: Page,
  options: Parameters<typeof pubAt>[1] = {}
) {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5), options)
  const startsAt = hours(2)
  const freeText = `Final ${pub.name}`
  const eventId = await createEvent({ barId: pub.barId, startsAt, freeText })
  await page.context().setGeolocation(spot)
  return { pub, spot, eventId, freeText, startsAt, dia: brasiliaDay(startsAt) }
}

test('visitante vê o jogo e os bares sem conta', async ({ page }) => {
  const { pub, freeText, dia } = await barComJogo(page)

  await page.goto(`/dashboard?dia=${dia}`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(freeText)
  await expect(cartao(page, pub.name)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('visitante marca "Vou assistir aqui", entra pela folha e o código abre', async ({
  page
}) => {
  const { pub, eventId, dia } = await barComJogo(page)
  const fan = await createUser({ role: 'fan' })

  await page.goto(`/dashboard?dia=${dia}`)
  await cartao(page, pub.name)
    .getByRole('button', { name: 'Vou assistir aqui' })
    .click()

  const folha = page.getByRole('dialog', { name: 'Entre para marcar presença' })
  await expect(folha).toBeVisible()
  await expect(folha.getByText(pub.name, { exact: true })).toBeVisible()
  await folha.getByLabel('E-mail').fill(fan.email)
  await folha.getByLabel('Senha').fill(fan.password)
  await folha.getByRole('button', { name: 'Entrar e marcar presença' }).click()

  // Bar Elite: a presença sai com o código do balcão.
  await expect(page).toHaveURL(new RegExp(`/dashboard/codigo/${eventId}$`))
  await expect
    .poll(
      async () =>
        (
          await query(
            'SELECT 1 FROM attendance WHERE user_id = $1 AND event_id = $2',
            [fan.id, eventId]
          )
        ).length
    )
    .toBe(1)
})

test('visitante salva o bar pela folha e ele fica salvo', async ({ page }) => {
  const { pub, dia } = await barComJogo(page)
  const fan = await createUser({ role: 'fan' })

  await page.goto(`/dashboard?dia=${dia}`)
  await cartao(page, pub.name)
    .getByRole('button', { name: `Salvar ${pub.name}` })
    .click()
  const folha = page.getByRole('dialog', { name: 'Entre para salvar este bar' })
  await folha.getByLabel('E-mail').fill(fan.email)
  await folha.getByLabel('Senha').fill(fan.password)
  await folha.getByRole('button', { name: 'Entrar e salvar' }).click()

  await expect.poll(() => isFavorite(fan.id, pub.barId)).toBe(true)
  await expect(
    cartao(page, pub.name).getByRole('button', {
      name: `Tirar ${pub.name} de Seus bares`
    })
  ).toBeVisible()
})

test('a ação volta pela URL depois do cadastro e sai uma vez', async ({
  page
}) => {
  const { pub, spot, dia } = await barComJogo(page)
  const fan = await signInFanAt(page, spot)

  await page.goto(`/dashboard?dia=${dia}&acao=fav.${pub.barId}`)

  await expect.poll(() => isFavorite(fan.id, pub.barId)).toBe(true)
  await expect(page).not.toHaveURL(/acao=/)
})

test('filtro e busca deixam só o bar que casa', async ({ page }) => {
  const { pub, spot, dia, freeText, startsAt } = await barComJogo(page, {
    bar: { amenities: [] }
  })
  const outro = await pubAt(north(spot, 0.8), { bar: { amenities: [1] } })
  await createEvent({ barId: outro.barId, startsAt, freeText })

  await page.goto(`/dashboard?dia=${dia}`)
  await expect(cartao(page, pub.name)).toBeVisible()
  await expect(cartao(page, outro.name)).toBeVisible()

  await page.getByRole('button', { name: 'Telão', exact: true }).click()
  await expect(cartao(page, pub.name)).toBeHidden()
  await expect(cartao(page, outro.name)).toBeVisible()
  await page.getByRole('button', { name: 'Telão', exact: true }).click()

  // O título do jogo leva o nome do primeiro bar; o segundo só casa pelo dele.
  await page.getByRole('searchbox').fill(outro.name)
  await expect(cartao(page, pub.name)).toBeHidden()
  await expect(cartao(page, outro.name)).toBeVisible()
})

test('bares perto sem jogo vêm abaixo dos que passam o jogo', async ({
  page
}) => {
  const { pub, spot, dia } = await barComJogo(page)
  // Mais perto que o do jogo, e mesmo assim depois dele.
  const quieto = await pubAt(north(spot, 0.2))

  await page.goto(`/dashboard?dia=${dia}`)
  await expect(
    page.getByRole('heading', { name: /Sem jogo marcado/ })
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('article.bc, article.bq')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-bar')))
    )
    .toEqual([pub.barId, quieto.barId])
  await expect(
    page
      .locator('article.bq')
      .getByRole('link', { name: new RegExp(quieto.name) })
  ).toHaveAttribute('href', `/pub/${quieto.barId}`)

  // A oferta da casa é de um jogo: sem jogo, o bar sai da lista.
  await page
    .getByRole('button', { name: 'Oferta da casa', exact: true })
    .click()
  await expect(page.locator('article.bq')).toHaveCount(0)
})

test('Elite no clássico vai na frente e registra exposição e clique', async ({
  page
}) => {
  const spot = uniqueSpot()
  const startsAt = hours(2)
  const [fla, pal] = [await team('flamengo'), await team('palmeiras')]
  const perto = await pubAt(north(spot, 0.3), {
    subscription: { plan: 'starter' }
  })
  const elite = await pubAt(north(spot, 1.5))
  const ids: Record<string, string> = {}
  for (const pub of [perto, elite]) {
    ids[pub.barId] = await createEvent({
      barId: pub.barId,
      startsAt,
      teamIds: [fla.id, pal.id]
    })
  }
  const fan = await signInFanAt(page, spot)
  const eventos = (type: string) =>
    query(
      `SELECT 1 FROM bar_commercial_event
        WHERE actor_user_id = $1 AND bar_id = $2 AND type = $3`,
      [fan.id, elite.barId, type]
    ).then((rows) => rows.length)

  await page.goto(`/dashboard?dia=${brasiliaDay(startsAt)}`)
  await expect
    .poll(() => page.locator('article.bc h3').allTextContents())
    .toEqual([elite.name, perto.name])
  await expect.poll(() => eventos('classic_exposure')).toBe(1)

  await cartao(page, elite.name)
    .getByRole('link', { name: `Abrir ${elite.name}` })
    .click()
  await expect.poll(() => eventos('classic_click')).toBe(1)
})

test('"Continuar como visitante" e "Ver jogos de hoje" levam ao Explorar', async ({
  page
}) => {
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await page.goto(path)
    await page.getByRole('link', { name: 'Continuar como visitante' }).click()
    await expect(page, path).toHaveURL(/\/dashboard$/)
  }
  // O cabeçalho do guia, o da landing antiga.
  await page.goto('/guia')
  const links = await page
    .getByRole('link', { name: /Ver jogos de hoje/, includeHidden: true })
    .all()
  expect(links.length).toBeGreaterThan(0)
  for (const link of links)
    await expect(link).toHaveAttribute('href', '/dashboard')
})

test('sem VITE_MAP_TILES_URL o mapa mostra o erro e a lista segue', async ({
  page
}) => {
  // O `vite dev` injeta `import.meta.env` no topo de cada módulo. Apagar a
  // URL só na resposta de `env.ts` é o mesmo que subir sem a variável.
  await page.route(/\/src\/lib\/env\.ts(\?|$)/, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      /("VITE_MAP_TILES_URL":\s*)"[^"]*"/,
      '$1""'
    )
    await route.fulfill({ response, body })
  })
  const { pub, dia } = await barComJogo(page)

  await page.goto(`/dashboard?dia=${dia}`)
  const error = page.getByRole('alert').filter({ hasText: 'Mapa indisponível' })
  await expect(error).toBeVisible()
  await expect(error.getByRole('button')).toHaveCount(0)
  await expect(cartao(page, pub.name)).toBeVisible()
})
