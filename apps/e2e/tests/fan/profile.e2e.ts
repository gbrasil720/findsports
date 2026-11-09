import type { Page } from '@playwright/test'
import { BASE_URL, MEDIA_PUBLIC_ORIGIN } from '../../env'
import { query } from '../../fixtures/db'
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

// Perfil (`/dashboard/profile`) e Preferências (`/dashboard/preferencias`) do
// web do torcedor (WEB-178, WEB-501). Cada teste usa um torcedor próprio:
// todos mudam a conta ou as preferências.

/** Seção das Preferências pelo título. */
const section = (page: Page, heading: string) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: heading })
  })

const userRow = (id: string) =>
  query<{
    name: string
    image: string | null
    search_radius_km: number
    search_city_name: string | null
  }>(
    'SELECT name, image, search_radius_km, search_city_name FROM "user" WHERE id = $1',
    [id]
  ).then(([row]) => row)

test('perfil mostra nível, conquistas e os times', async ({ page }) => {
  const fan = await signInFanAt(page, uniqueSpot())
  await setPreferences(fan.id, { sports: ['futebol'], teams: ['arsenal'] })

  await page.goto('/dashboard/profile')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(fan.name)
  await expect(page.getByText(/· nível 1$/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conquistas' })).toBeVisible()
  await expect(section(page, 'Seus times')).toContainText('Arsenal')
})

test('"Agora não" numa sugestão e recomeçar pelas Preferências', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)
  await setPreferences(fan.id, { sports: ['futebol'] })

  await page.goto('/dashboard/pra-voce')
  const linha = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: pub.name })
  })
  await linha.getByRole('button', { name: 'Agora não' }).click()
  await expect(linha.getByText('Fica para outro dia')).toBeVisible()
  await linha.getByRole('button', { name: 'Desfazer' }).click()
  await expect(linha.getByRole('button', { name: 'Salvar' })).toBeVisible()

  await page.goto('/dashboard/preferencias')
  page.once('dialog', (dialog) => void dialog.accept())
  await section(page, 'Sugestões')
    .getByRole('button', { name: 'Recomeçar' })
    .click()
  await expect(page.getByText('Sugestões recomeçadas')).toBeVisible()
})

test('edita nome, esportes, raio, cidade e times', async ({ page }) => {
  const fan = await signInFanAt(page, uniqueSpot())
  await setPreferences(fan.id, { sports: ['futebol'] })
  const newName = `Torcedor ${Date.now()}`

  await page.goto('/dashboard/preferencias?aba=conta')
  await page.getByRole('button', { name: 'Editar' }).first().click()
  await page.getByLabel('Nome', { exact: true }).fill(newName)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect.poll(async () => (await userRow(fan.id))?.name).toBe(newName)

  await page.goto('/dashboard/preferencias')
  const sports = section(page, 'Esportes')
  await sports.getByRole('button', { name: 'Basquete', exact: true }).click()
  await expect(
    sports.getByRole('button', { name: 'Basquete', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')

  await section(page, 'Até onde você topa ir')
    .getByRole('slider', { name: 'Raio em km' })
    .fill('27')
  await expect
    .poll(async () => (await userRow(fan.id))?.search_radius_km)
    .toBe(27)

  const city = section(page, 'Até onde você topa ir')
  await city.getByRole('combobox', { name: 'Cidade' }).fill('sao jose dos camp')
  await city.getByRole('option', { name: /^São José dos Campos\s*SP$/ }).click()
  await city.getByRole('button', { name: 'Salvar cidade' }).click()
  await expect(page.getByText('Cidade salva.')).toBeVisible()
  await expect
    .poll(async () => (await userRow(fan.id))?.search_city_name)
    .toBe('São José dos Campos')

  const teams = section(page, 'Seus times')
  await teams.getByRole('button', { name: 'Arsenal', exact: true }).click()
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

  await page.goto('/dashboard/preferencias?aba=conta')
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
  await expect(page.locator('.ava img')).toHaveAttribute('src', url ?? '')
  expect(uploads).toEqual([
    { pathname: `users/${fan.id}/avatar`, contentType: 'image/jpeg' }
  ])

  // Volta do servidor, não só do estado local.
  await page.reload()
  await expect(page.locator('.ava img')).toHaveAttribute('src', url ?? '')
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
