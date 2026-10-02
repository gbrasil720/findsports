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

// Ordenação do `/dashboard` (WEB-178). Serial porque liga
// `rating.public_display`, que é global.
//
// Um Elite mal avaliado e um Pro bem avaliado: na relevância o plano vem
// antes da nota, em "Melhor avaliados" a nota vem antes do plano. As
// contagens vão direto em `bar.rating_*`, que o trigger de `bar_rating`
// mantém — a busca lê só essas colunas.

test.afterEach(resetAppConfig)

async function setup(page: Page) {
  const spot = uniqueSpot()
  const elite = await pubAt(north(spot, 0.5), {
    bar: { rating_count: 5, rating_positive: 1 }
  })
  const pro = await pubAt(north(spot, 0.8), {
    subscription: { plan: 'pro' },
    bar: { rating_count: 10, rating_positive: 10 }
  })
  for (const { barId } of [elite, pro]) {
    await createEvent({ barId, startsAt: days(2) })
  }
  await signInFanAt(page, spot)
  return { elite, pro }
}

/** Nomes dos bares na ordem da lista. */
const listed = async (page: Page) =>
  Promise.all(
    (await page.locator('a[aria-label^="Ver "]').all()).map(async (link) =>
      (await link.getAttribute('aria-label'))?.slice(4)
    )
  )

test('com a nota pública desligada não há ordenação nem nota', async ({
  page
}) => {
  const { elite, pro } = await setup(page)

  await page.goto('/dashboard')
  await expect.poll(() => listed(page)).toEqual([elite.name, pro.name])
  await expect(
    page.getByRole('button', { name: 'Melhor avaliados' })
  ).toHaveCount(0)
  await expect(page.getByText(/% voltariam/)).toHaveCount(0)
})

test('com a nota pública, ordena por relevância e por avaliação', async ({
  page
}) => {
  await setAppConfig('rating.public_display', true)
  const { elite, pro } = await setup(page)

  await page.goto('/dashboard')
  await expect(
    page.getByRole('button', { name: 'Mais relevantes' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => listed(page)).toEqual([elite.name, pro.name])
  await expect(page.getByText('100% voltariam')).toBeVisible()

  await page.getByRole('button', { name: 'Melhor avaliados' }).click()
  await expect(
    page.getByRole('button', { name: 'Melhor avaliados' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => listed(page)).toEqual([pro.name, elite.name])

  await page.getByRole('button', { name: 'Mais relevantes' }).click()
  await expect.poll(() => listed(page)).toEqual([elite.name, pro.name])
})
