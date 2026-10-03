import type { Page } from '@playwright/test'
import { BASE_URL, MEDIA_PUBLIC_ORIGIN } from '../../env'
import { insert, query } from '../../fixtures/db'
import {
  createEvent,
  days,
  north,
  pubAt,
  setPreferences,
  signInFanAt,
  uniqueSpot
} from '../../fixtures/fan'
import { interceptMediaUploads } from '../../fixtures/media'
import { expect, test } from '../../fixtures/test'

// `/dashboard/profile` (WEB-178). Cada teste usa um torcedor próprio: todos
// mudam a conta ou as preferências.

const tab = (page: Page, name: string) => page.getByRole('tab', { name })

/** Seção da aba Configurações pelo título. */
const section = (page: Page, heading: string) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: heading })
  })

const userRow = (id: string) =>
  query<{ name: string; image: string | null; search_radius_km: number }>(
    'SELECT name, image, search_radius_km FROM "user" WHERE id = $1',
    [id]
  ).then(([row]) => row)

test('as três abas: visão geral, favoritos e configurações', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const fan = await signInFanAt(page, spot)
  await insert('user_favorite_bars', { user_id: fan.id, bar_id: pub.barId })

  await page.goto('/dashboard/profile')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(fan.name)
  await expect(tab(page, 'Visão geral')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByText('Sugestões para você')).toBeVisible()

  await tab(page, 'Favoritos').click()
  await expect(tab(page, 'Favoritos')).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('button', { name: `Remover ${pub.name} dos favoritos` })
  ).toBeVisible()

  await tab(page, 'Configurações').click()
  await expect(
    page.getByRole('heading', { name: 'Raio de busca' })
  ).toBeVisible()
  await expect(page.getByText('Sugestões para você')).toHaveCount(0)
})

test('sugestão dispensada some e volta depois de recomeçar', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)
  await setPreferences(fan.id, { sports: ['futebol'] })

  await page.goto('/dashboard/profile')
  const suggestion = page.getByRole('article').filter({ hasText: pub.name })
  await expect(suggestion).toBeVisible()
  await suggestion.getByRole('button', { name: 'Não tenho interesse' }).click()
  await expect(suggestion).toHaveCount(0)
  await expect(page.getByText('Novas sugestões em breve')).toBeVisible()

  await tab(page, 'Configurações').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Recomeçar minhas sugestões' }).click()
  await expect(
    page.getByText(
      'Sugestões recomeçadas. Seus dados do perfil foram preservados.'
    )
  ).toBeVisible()

  await tab(page, 'Visão geral').click()
  await expect(suggestion).toBeVisible()
})

test('edita nome, esportes, raio e times', async ({ page }) => {
  const fan = await signInFanAt(page, uniqueSpot())
  await setPreferences(fan.id, { sports: ['futebol'] })
  const newName = `Torcedor ${fan.id.slice(0, 6)}`

  await page.goto('/dashboard/profile')

  // Nome
  await page.getByRole('button', { name: 'Editar nome' }).click()
  await page.getByLabel('Nome de exibição').fill(newName)
  await page.getByRole('button', { name: 'Salvar nome' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(newName)
  await expect.poll(async () => (await userRow(fan.id))?.name).toBe(newName)

  await tab(page, 'Configurações').click()

  // Esportes
  const sports = section(page, 'Esportes favoritos')
  await sports.getByRole('button', { name: 'Editar' }).click()
  await sports.getByRole('button', { name: 'Basquete', exact: true }).click()
  await sports.getByRole('button', { name: 'Salvar' }).click()
  await expect(sports.getByText('Basquete', { exact: true })).toBeVisible()
  await expect(sports.getByText('Futebol', { exact: true })).toBeVisible()
  await expect(sports.getByRole('button', { name: 'Salvar' })).toHaveCount(0)

  // Raio
  const radius = section(page, 'Raio de busca')
  await radius.getByRole('button', { name: '10 km' }).click()
  await expect(radius.getByRole('button', { name: '10 km' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect
    .poll(async () => (await userRow(fan.id))?.search_radius_km)
    .toBe(10)

  // Times
  const teams = section(page, 'Quem você acompanha')
  await expect(teams.getByText('Ninguém escolhido ainda')).toBeVisible()
  await teams.getByRole('button', { name: 'Editar' }).click()
  await teams.getByRole('button', { name: 'Arsenal', exact: true }).click()
  await teams.getByRole('button', { name: 'Salvar' }).click()
  await expect(teams.getByText('Arsenal', { exact: true })).toBeVisible()
  await expect(teams.getByRole('button', { name: 'Salvar' })).toHaveCount(0)
  await expect
    .poll(async () =>
      (
        await query<{ slug: string }>(
          `SELECT t.slug FROM user_favorite_teams uft
           JOIN team t ON t.id = uft.team_id WHERE uft.user_id = $1`,
          [fan.id]
        )
      ).map((row) => row.slug)
    )
    .toEqual(['arsenal'])
  await expect
    .poll(async () =>
      (
        await query<{ slug: string }>(
          `SELECT s.slug FROM user_preference_sports ups
           JOIN sport s ON s.id = ups.sport_id WHERE ups.user_id = $1
           ORDER BY s.slug`,
          [fan.id]
        )
      ).map((row) => row.slug)
    )
    .toEqual(['basquete', 'futebol'])
})

test('avatar: upload interceptado e a imagem salva aparece', async ({
  page
}) => {
  const uploads = await interceptMediaUploads(page)
  const fan = await signInFanAt(page, uniqueSpot())

  await page.goto('/dashboard/profile')
  await page.getByLabel('Escolher foto de perfil').setInputFiles({
    name: 'eu.png',
    mimeType: 'image/png',
    // PNG 1x1: o app recorta e recomprime em JPEG no navegador.
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    )
  })

  await expect
    .poll(async () => (await userRow(fan.id))?.image)
    .toMatch(
      new RegExp(`^${MEDIA_PUBLIC_ORIGIN}/users/${fan.id}/avatar\\?v=\\d+$`)
    )
  const url = (await userRow(fan.id))?.image
  await expect(page.getByRole('img', { name: fan.name })).toHaveAttribute(
    'src',
    url ?? ''
  )
  expect(uploads).toEqual([
    { pathname: `users/${fan.id}/avatar`, contentType: 'image/jpeg' }
  ])

  // Volta do servidor, não só do estado local.
  await page.reload()
  await expect(page.getByRole('img', { name: fan.name })).toHaveAttribute(
    'src',
    url ?? ''
  )
})

test('avatar: a API recusa foto fora do nosso host', async ({ page }) => {
  const fan = await signInFanAt(page, uniqueSpot())
  const own = `${MEDIA_PUBLIC_ORIGIN}/users/${fan.id}/avatar?v=1`
  const updateImage = (image: string) =>
    page.request.post('/api/auth/update-user', {
      data: { image },
      headers: { origin: BASE_URL }
    })

  // Host de terceiro rastrearia quem vê a foto; avatar de outro usuário
  // também não vale, mesmo no nosso host. O Vercel Blob saiu no WEB-202.
  for (const image of [
    `https://evil.example/users/${fan.id}/avatar`,
    `${MEDIA_PUBLIC_ORIGIN}/users/outro/avatar`,
    `https://e2e.public.blob.vercel-storage.com/users/${fan.id}/avatar`
  ]) {
    expect((await updateImage(image)).status()).toBe(400)
  }
  expect((await userRow(fan.id))?.image).toBeNull()

  expect((await updateImage(own)).ok()).toBe(true)
  expect((await userRow(fan.id))?.image).toBe(own)
})
