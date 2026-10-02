import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { createEvent } from '../../fixtures/reservations'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Minha grade": criar, editar e excluir jogo, limite de jogos por plano e
// sinal de interesse dos torcedores.

const STARTER_LIMIT = 5

async function openSchedule(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  return pub
}

async function gotoSchedule(page: Page) {
  await page.goto('/admin#admin-grade')
  await expect(page.getByRole('tab', { name: 'Minha grade' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
}

/** `datetime-local` de amanhã às 21h, no fuso do navegador (São Paulo). */
function tomorrowAt(hour: number): string {
  const date = new Date(Date.now() + 86_400_000)
  const day = date.toLocaleDateString('sv-SE', {
    timeZone: 'America/Sao_Paulo'
  })
  return `${day}T${String(hour).padStart(2, '0')}:00`
}

/** Três times de futebol semeados, em ordem alfabética. */
async function soccerTeams(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT t.name FROM team t JOIN sport s ON s.id = t.sport_id
     WHERE s.slug = 'futebol' ORDER BY t.name LIMIT 3`
  )
  return rows.map((row) => row.name)
}

async function participantsOf(barId: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT t.name FROM event_participants ep
     JOIN event e ON e.id = ep.event_id JOIN team t ON t.id = ep.team_id
     WHERE e.bar_id = $1 ORDER BY t.name`,
    [barId]
  )
  return rows.map((row) => row.name)
}

test('cria, edita e exclui um jogo da grade com o seletor de times', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  const [home = '', away = '', other = ''] = await soccerTeams()
  await gotoSchedule(page)

  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo evento' })
  await dialog.getByLabel('Esporte *').selectOption({ label: 'Futebol' })
  await dialog.getByLabel('Campeonato *').fill('Brasileirão E2E')
  await dialog.getByLabel('Data e horário *').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: home, exact: true }).click()
  await dialog.getByRole('button', { name: away, exact: true }).click()
  // Futebol é confronto direto: o terceiro time fica travado.
  await expect(
    dialog.getByRole('button', { name: other, exact: true })
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Brasileirão E2E' })
  await expect(row).toContainText(home)
  await expect(row).toContainText(away)
  await expect(row).toContainText('PROGRAMADO')
  expect(await participantsOf(barId)).toEqual([home, away])

  await row.getByRole('button', { name: 'Editar evento' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar evento' })
  await expect(edit.getByLabel('Campeonato *')).toHaveValue('Brasileirão E2E')
  await edit.getByLabel('Campeonato *').fill('Copa E2E')
  await edit.getByRole('button', { name: away, exact: true }).click()
  await edit.getByRole('button', { name: other, exact: true }).click()
  await edit.getByRole('button', { name: 'Salvar' }).click()
  await expect(edit).toBeHidden()

  const edited = page.getByRole('listitem').filter({ hasText: 'Copa E2E' })
  await expect(edited).toContainText(other)
  await expect(edited).not.toContainText(away)
  expect(await participantsOf(barId)).toEqual([home, other])

  await edited.getByRole('button', { name: 'Excluir evento' }).click()
  await expect(edited).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await query('SELECT id FROM event WHERE bar_id = $1', [barId])).length
    )
    .toBe(0)
})

test('término antes do início não deixa salvar', async ({ page }) => {
  await openSchedule(page)
  await gotoSchedule(page)

  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo evento' })
  await dialog.getByLabel('Esporte *').selectOption({ label: 'Futebol' })
  await dialog.getByLabel('Campeonato *').fill('Brasileirão E2E')
  await dialog.getByLabel('Data e horário *').fill(tomorrowAt(21))
  await dialog.getByLabel('Horário de término').fill(tomorrowAt(20))
  await expect(
    dialog.getByText('Término deve ser posterior ao início.')
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Salvar' })).toBeDisabled()
})

test('Starter cria até o limite do mês e depois é mandado para os planos', async ({
  page
}) => {
  const { barId } = await openSchedule(page, {
    subscription: { plan: 'starter' }
  })
  for (let i = 0; i < STARTER_LIMIT - 1; i++) await createEvent(barId)
  await gotoSchedule(page)

  // Falta um: ainda cria.
  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo evento' })
  await dialog.getByLabel('Esporte *').selectOption({ label: 'Futebol' })
  await dialog.getByLabel('Campeonato *').fill('Quinto jogo E2E')
  await dialog.getByLabel('Data e horário *').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog).toBeHidden()

  // No limite: botão travado, motivo e caminho para o upgrade.
  await expect(page.getByRole('button', { name: 'Novo evento' })).toBeDisabled()
  await expect(page.getByText('Limite do plano atingido.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveAttribute('href', '/plan')
})

test('o servidor recusa o sexto jogo do Starter', async ({ page }) => {
  const { barId } = await openSchedule(page, {
    subscription: { plan: 'starter' }
  })
  for (let i = 0; i < STARTER_LIMIT; i++) await createEvent(barId)
  const [sport] = await query<{ id: string }>(
    "SELECT id FROM sport WHERE slug = 'futebol'"
  )

  const response = await page.request.post('/api/trpc/pub.createEvent', {
    data: {
      sportId: sport?.id,
      championship: 'Sexto jogo',
      startsAt: new Date(Date.now() + 86_400_000).toISOString()
    }
  })
  expect(response.status()).toBe(403)
  expect(
    (await query('SELECT id FROM event WHERE bar_id = $1', [barId])).length
  ).toBe(STARTER_LIMIT)
})

for (const plan of ['pro', 'elite'] as const) {
  test(`${plan} não tem limite de jogos`, async ({ page }) => {
    const { barId } = await openSchedule(page, { subscription: { plan } })
    for (let i = 0; i < STARTER_LIMIT + 1; i++) await createEvent(barId)
    await gotoSchedule(page)

    await expect(
      page.getByRole('button', { name: 'Novo evento' })
    ).toBeEnabled()
    await expect(page.getByText('Limite do plano atingido.')).toHaveCount(0)
  })
}

test('bar inativo não cria jogo, nem pela tela nem pela API', async ({
  page
}) => {
  const { barId } = await openSchedule(page, { bar: { is_active: false } })
  await gotoSchedule(page)

  await expect(page.getByRole('button', { name: 'Novo evento' })).toBeDisabled()
  await expect(
    page.getByText('Ative um plano para adicionar eventos.').first()
  ).toBeVisible()

  const [sport] = await query<{ id: string }>(
    "SELECT id FROM sport WHERE slug = 'futebol'"
  )
  const response = await page.request.post('/api/trpc/pub.createEvent', {
    data: {
      sportId: sport?.id,
      championship: 'Jogo de bar inativo',
      startsAt: new Date(Date.now() + 86_400_000).toISOString()
    }
  })
  expect(response.status()).toBe(403)
  expect(
    await query('SELECT id FROM event WHERE bar_id = $1', [barId])
  ).toEqual([])
})

test('o interesse dos torcedores aparece no jogo depois de 5 jogos com presença', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  const attend = async (eventId: string, fans: number) => {
    for (let i = 0; i < fans; i++) {
      const fan = await createUser()
      await insert('attendance', { user_id: fan.id, event_id: eventId })
    }
  }
  // Histórico: 5 jogos encerrados com 1 presença cada (média 1).
  for (let day = 2; day <= 6; day++) {
    const past = await createEvent(barId, {
      startsAt: new Date(Date.now() - day * 86_400_000)
    })
    await attend(past.eventId, 1)
  }
  const next = await createEvent(barId, {
    startsAt: new Date(Date.now() + 86_400_000),
    championship: 'Jogo com interesse E2E'
  })
  await attend(next.eventId, 2)
  await gotoSchedule(page)

  await expect(
    page.getByRole('listitem').filter({ hasText: 'Jogo com interesse E2E' })
  ).toContainText('Interesse: 2x a média deste bar')
})

test('sem histórico, a grade avisa que ainda reúne dados de interesse', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  await createEvent(barId)
  await gotoSchedule(page)
  await expect(
    page.getByText('Estamos reunindo dados sobre o interesse no seu bar.', {
      exact: false
    })
  ).toBeVisible()
})
