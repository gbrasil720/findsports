import type { Page } from '@playwright/test'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import {
  createEvent,
  days,
  north,
  pubAt,
  signInFanAt,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'

// Ordenação do Explorar (WEB-178, WEB-501). Serial porque liga
// `rating.public_display`, que é global.
//
// Um Elite com cinco estrelas mais longe e um Pro com duas mais perto, no
// mesmo jogo: "Mais perto" põe o Pro na frente, "Melhor nota" o Elite. As
// contagens vão direto em `bar.rating_*`, que o trigger de `bar_rating`
// mantém — a régua lê só essas colunas.

test.afterEach(resetAppConfig)

async function setup(page: Page) {
  const spot = uniqueSpot()
  const elite = await pubAt(north(spot, 0.8), {
    bar: {
      rating_count: 5,
      rating_positive: 5,
      rating_stars_count: 5,
      rating_stars_sum: 25
    }
  })
  const pro = await pubAt(north(spot, 0.5), {
    subscription: { plan: 'pro' },
    bar: {
      rating_count: 10,
      rating_positive: 4,
      rating_stars_count: 10,
      rating_stars_sum: 20
    }
  })
  const startsAt = days(2)
  for (const { barId } of [elite, pro]) {
    await createEvent({ barId, startsAt, freeText: `Jogo ${elite.name}` })
  }
  await signInFanAt(page, spot)
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo'
  }).format(startsAt)
  return { elite, pro, dia }
}

/** Nomes dos bares na ordem da lista. */
const listed = async (page: Page) =>
  page.locator('article.bc h3').allTextContents()

test('com a nota pública desligada não há ordenação nem nota', async ({
  page
}) => {
  const { elite, pro, dia } = await setup(page)

  await page.goto(`/dashboard?dia=${dia}`)
  await expect.poll(() => listed(page)).toEqual([pro.name, elite.name])
  await expect(page.getByRole('option', { name: 'Melhor nota' })).toHaveCount(0)
  await expect(page.getByText(/verificadas/)).toHaveCount(0)
})

test('com a nota pública, ordena por perto e por nota', async ({ page }) => {
  await setAppConfig('rating.public_display', true)
  const { elite, pro, dia } = await setup(page)

  await page.goto(`/dashboard?dia=${dia}`)
  await expect.poll(() => listed(page)).toEqual([pro.name, elite.name])
  await expect(page.getByText('10 verificadas')).toBeVisible()

  await page.getByRole('combobox', { name: 'Ordenar' }).selectOption('nota')
  await expect.poll(() => listed(page)).toEqual([elite.name, pro.name])

  await page.getByRole('combobox', { name: 'Ordenar' }).selectOption('perto')
  await expect.poll(() => listed(page)).toEqual([pro.name, elite.name])
})
