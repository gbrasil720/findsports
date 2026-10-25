import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent, createTicket, soccerSportId } from '../../fixtures/going'
import {
  LARGURAS_CELULAR,
  painelLink,
  vazamentoLateral
} from '../../fixtures/painel'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Jogos do painel: criar, editar, duplicar e excluir jogo, limite de jogos
// por plano e sinal de interesse dos torcedores.

const STARTER_LIMIT = 5

async function openSchedule(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  return pub
}

async function gotoSchedule(page: Page) {
  await page.goto('/admin/jogos')
  await expect(painelLink(page, 'Jogos')).toHaveAttribute(
    'aria-current',
    'page'
  )
}

/**
 * Amanhã às `hour`h no formato do campo com máscara (`dd/mm/aaaa hh:mm`), no
 * fuso do navegador (São Paulo).
 */
function tomorrowAt(hour: number): string {
  const date = new Date(Date.now() + 86_400_000)
  const day = date.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
  return `${day} ${String(hour).padStart(2, '0')}:00`
}

/** Três times de futebol semeados, em ordem alfabética. */
async function soccerTeams(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT t.name FROM team t JOIN sport s ON s.id = t.sport_id
     WHERE s.slug = 'futebol' AND t.featured ORDER BY t.name LIMIT 3`
  )
  return rows.map((row) => row.name)
}

/** Abre o jogo da lista; o detalhe aparece à direita. */
async function openGame(page: Page, text: string) {
  await page
    .getByRole('listitem')
    .filter({ hasText: text })
    .getByRole('button')
    .click()
  return page.getByRole('region', { name: /^Jogo aberto/ })
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

  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('button', { name: 'Futebol', exact: true }).click()
  await dialog.getByLabel('Campeonato', { exact: true }).fill('Brasileirão E2E')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: home, exact: true }).click()
  await dialog.getByRole('button', { name: away, exact: true }).click()
  // Futebol é confronto direto: fechado o confronto, a lista recolhe para os
  // dois marcados.
  await expect(
    dialog.getByRole('button', { name: other, exact: true })
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Publicar jogo' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Brasileirão E2E' })
  await expect(row).toContainText(home)
  await expect(row).toContainText(away)
  await expect(row).toContainText('Publicado')
  expect(await participantsOf(barId)).toEqual([home, away])

  await (await openGame(page, 'Brasileirão E2E'))
    .getByRole('button', { name: 'Editar' })
    .click()
  const edit = page.getByRole('dialog', { name: 'Editar jogo' })
  await expect(edit.getByLabel('Campeonato', { exact: true })).toHaveValue(
    'Brasileirão E2E'
  )
  await edit.getByLabel('Campeonato', { exact: true }).fill('Copa E2E')
  await edit.getByRole('button', { name: away, exact: true }).click()
  await edit.getByRole('button', { name: other, exact: true }).click()
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(edit).toBeHidden()

  const edited = page.getByRole('listitem').filter({ hasText: 'Copa E2E' })
  await expect(edited).toContainText(other)
  await expect(edited).not.toContainText(away)
  expect(await participantsOf(barId)).toEqual([home, other])

  // Excluir pede confirmação: cancelar não apaga nada.
  await (await openGame(page, 'Copa E2E'))
    .getByRole('button', { name: 'Excluir' })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Excluir este jogo?' })
  await expect(confirm).toContainText('sai da sua grade e do seu perfil')
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirm).toBeHidden()
  await expect(edited).toHaveCount(1)

  await (await openGame(page, 'Copa E2E'))
    .getByRole('button', { name: 'Excluir' })
    .click()
  await confirm.getByRole('button', { name: 'Excluir jogo' }).click()
  await expect(edited).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await query('SELECT id FROM event WHERE bar_id = $1', [barId])).length
    )
    .toBe(0)
})

// A ordem em que o dono marca os times é a do confronto (mandante primeiro),
// e não a alfabética: o banco guarda `event_participants.position`.
test('a ordem em que os times são marcados é a do confronto, e dá para inverter', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  const [first = '', second = ''] = await soccerTeams()
  await gotoSchedule(page)

  // Marcados fora da ordem alfabética: `second` joga em casa.
  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('button', { name: 'Futebol', exact: true }).click()
  await dialog.getByLabel('Campeonato', { exact: true }).fill('Ordem E2E')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: second, exact: true }).click()
  await dialog.getByRole('button', { name: first, exact: true }).click()
  await expect(dialog).toContainText(`Confronto: ${second} × ${first}`)
  await dialog.getByRole('button', { name: 'Publicar jogo' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Ordem E2E' })
  await expect(row).toContainText(`${second} × ${first}`)
  await page.goto(`/pub/${barId}`)
  await expect(page.getByText(`${second} × ${first}`).first()).toBeVisible()

  // Editar abre na ordem gravada; inverter troca mandante e visitante.
  await gotoSchedule(page)
  await (await openGame(page, 'Ordem E2E'))
    .getByRole('button', { name: 'Editar' })
    .click()
  const edit = page.getByRole('dialog', { name: 'Editar jogo' })
  await expect(edit).toContainText(`Confronto: ${second} × ${first}`)
  await edit.getByRole('button', { name: 'Inverter' }).click()
  await expect(edit).toContainText(`Confronto: ${first} × ${second}`)
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(edit).toBeHidden()

  await expect(row).toContainText(`${first} × ${second}`)
  await page.goto(`/pub/${barId}`)
  await expect(page.getByText(`${first} × ${second}`).first()).toBeVisible()
})

// Duplicar abre o formulário de jogo novo com o mesmo jogo uma semana depois.
test('duplica um jogo para a semana seguinte', async ({ page }) => {
  const { barId } = await openSchedule(page)
  const startsAt = new Date(Date.now() + 86_400_000)
  await createEvent(barId, { championship: 'Duplicado E2E', startsAt })
  await gotoSchedule(page)

  await (await openGame(page, 'Duplicado E2E'))
    .getByRole('button', { name: 'Duplicar' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await expect(dialog.getByLabel('Campeonato', { exact: true })).toHaveValue(
    'Duplicado E2E'
  )
  const nextWeek = new Date(startsAt.getTime() + 7 * 86_400_000)
  const day = nextWeek.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
  // Fora do foco, por extenso ("Sáb, 17 out · 21:00", 1p); no foco, a máscara.
  const comeca = dialog.getByLabel('Começa')
  await expect(comeca).toHaveValue(
    new RegExp(
      `^\\p{L}{3}, ${nextWeek.toLocaleDateString('pt-BR', { day: 'numeric', timeZone: 'America/Sao_Paulo' })} \\p{L}{3} · \\d{2}:\\d{2}$`,
      'u'
    )
  )
  await comeca.focus()
  expect(await comeca.inputValue()).toMatch(new RegExp(`^${day} `))
  await dialog.getByRole('button', { name: 'Publicar jogo' }).click()
  await expect(dialog).toBeHidden()

  await expect
    .poll(
      async () =>
        (
          await query<{ id: string }>(
            "SELECT id FROM event WHERE bar_id = $1 AND championship = 'Duplicado E2E'",
            [barId]
          )
        ).length
    )
    .toBe(2)
})

test('jogo com código de quem vai não é excluído, e o desmarcado vai junto', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  const blocked = await createEvent(barId, { championship: 'Bloqueado E2E' })
  await createTicket(blocked.eventId)
  const free = await createEvent(barId, { championship: 'Liberado E2E' })
  await createTicket(free.eventId, { unmarked: true })
  await gotoSchedule(page)

  await (await openGame(page, 'Bloqueado E2E'))
    .getByRole('button', { name: 'Excluir' })
    .click()
  const refusal = page.getByRole('dialog', {
    name: 'Este jogo não pode ser excluído'
  })
  await expect(refusal).toContainText('Este jogo tem 1 código de quem vai.')
  await expect(
    refusal.getByRole('button', { name: 'Excluir jogo' })
  ).toHaveCount(0)
  await refusal.getByRole('button', { name: 'Entendi' }).click()

  // A tela esconder o botão não é a regra: o servidor recusa também.
  const response = await page.request.post('/api/trpc/pub.deleteEvent', {
    data: { eventId: blocked.eventId }
  })
  expect(response.status()).toBe(412)

  await (await openGame(page, 'Liberado E2E'))
    .getByRole('button', { name: 'Excluir' })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Excluir este jogo?' })
  await expect(confirm).toContainText('Também apaga 1 código desmarcado')
  await confirm.getByRole('button', { name: 'Excluir jogo' }).click()
  await expect
    .poll(async () =>
      (
        await query<{ id: string }>('SELECT id FROM event WHERE bar_id = $1', [
          barId
        ])
      ).map((row) => row.id)
    )
    .toEqual([blocked.eventId])
})

// WEB-437: o Elite desliga a lista de quem vai num jogo. Quem já marcou fica
// com o código; o painel deixa de listar o jogo em Quem vai.
test('desliga a lista de quem vai num jogo, avisando quem já marcou', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  const { eventId } = await createEvent(barId, { championship: 'Lista E2E' })
  const ticket = await createTicket(eventId)
  await gotoSchedule(page)

  const aberto = await openGame(page, 'Lista E2E')
  await expect(aberto).toContainText(ticket.guestName)
  await aberto.getByRole('button', { name: 'Editar' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar jogo' })
  const lista = edit.getByRole('switch', {
    name: 'Lista de quem vai neste jogo'
  })
  await expect(lista).toHaveAttribute('aria-checked', 'true')
  await lista.click()
  await expect(lista).toHaveAttribute('aria-checked', 'false')
  await expect(edit).toContainText(
    '1 pessoa já marcou: o código continua valendo. Ninguém novo entra.'
  )
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(edit).toBeHidden()

  await expect
    .poll(async () =>
      (
        await query<{ attendance_enabled: boolean }>(
          'SELECT attendance_enabled FROM event WHERE id = $1',
          [eventId]
        )
      ).map((row) => row.attendance_enabled)
    )
    .toEqual([false])
  // A presença e o código continuam; só a lista some do painel.
  expect(
    await query('SELECT 1 FROM attendance WHERE event_id = $1', [eventId])
  ).toHaveLength(1)
  const fechado = await openGame(page, 'Lista E2E')
  await expect(fechado).toContainText('lista de quem vai desligada')
  await expect(fechado).not.toContainText(ticket.guestName)

  await page.goto('/admin/quem-vai')
  await expect(page.getByText('Ninguém marcou ainda.')).toBeVisible()
  await expect(page.getByText(ticket.guestName)).toHaveCount(0)
})

test('Starter não tem o interruptor da lista de quem vai', async ({ page }) => {
  await openSchedule(page, { subscription: { plan: 'starter' } })
  await gotoSchedule(page)
  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await expect(dialog.getByText('Oferta da casa neste jogo')).toBeVisible()
  await expect(
    dialog.getByRole('switch', { name: 'Lista de quem vai neste jogo' })
  ).toHaveCount(0)
})

test('término antes do início não deixa salvar', async ({ page }) => {
  await openSchedule(page)
  await gotoSchedule(page)

  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('button', { name: 'Futebol', exact: true }).click()
  await dialog.getByLabel('Campeonato', { exact: true }).fill('Brasileirão E2E')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await dialog.getByLabel('Termina').fill(tomorrowAt(20))
  await expect(
    dialog.getByText('Término deve ser posterior ao início.')
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Publicar jogo' })
  ).toBeDisabled()
})

test('"Termina" mostra só a hora na mesma noite e a data inteira para editar (1p)', async ({
  page
}) => {
  await openSchedule(page)
  await gotoSchedule(page)

  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  const termina = dialog.getByLabel('Termina')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await termina.fill(tomorrowAt(23))
  await termina.blur()
  await expect(termina).toHaveValue('23:00')
  // No foco volta a data inteira, que é o que se edita.
  await termina.focus()
  await expect(termina).toHaveValue(tomorrowAt(23))

  // A madrugada seguinte também é "a mesma noite".
  const depois = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString(
    'pt-BR',
    { timeZone: 'America/Sao_Paulo' }
  )
  await termina.fill(`${depois} 01:30`)
  await termina.blur()
  await expect(termina).toHaveValue('01:30')
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
  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('button', { name: 'Futebol', exact: true }).click()
  await dialog.getByLabel('Campeonato', { exact: true }).fill('Quinto jogo E2E')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: 'Publicar jogo' }).click()
  await expect(dialog).toBeHidden()

  // No limite (1ab): botão com cadeado, o aviso e o caminho para o upgrade,
  // e à direita o card do plano no limite com o que o Pro libera.
  await expect(page.getByRole('button', { name: 'Novo jogo' })).toBeDisabled()
  const aviso = page.getByRole('region', { name: 'Aviso do plano' })
  await expect(aviso).toContainText('Limite de jogos atingido até')
  await expect(
    aviso.getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveAttribute('href', '/plan?origin=admin')
  const plano = page.getByRole('region', { name: 'Seu plano' })
  await expect(plano).toContainText('Limite atingido')
  await expect(plano).toContainText('5 de 5 jogos usados')
  await expect(page.getByRole('region', { name: 'No Pro' })).toContainText(
    'Jogos ilimitados'
  )
})

test('o servidor recusa o sexto jogo do Starter', async ({ page }) => {
  const { barId } = await openSchedule(page, {
    subscription: { plan: 'starter' }
  })
  for (let i = 0; i < STARTER_LIMIT; i++) await createEvent(barId)

  const response = await page.request.post('/api/trpc/pub.createEvent', {
    data: {
      sportId: await soccerSportId(),
      championship: 'Sexto jogo',
      startsAt: new Date(Date.now() + 86_400_000).toISOString()
    }
  })
  expect(response.status()).toBe(403)
  expect(
    (await query('SELECT id FROM event WHERE bar_id = $1', [barId])).length
  ).toBe(STARTER_LIMIT)
})

// WEB-331: Elite parado cai no limite do Starter (WEB-129), mas o que resolve
// é regularizar a assinatura que ele já tem, não fazer upgrade.
test('Elite com pagamento pendente vê o limite em vigor e é mandado regularizar', async ({
  page
}) => {
  const { barId } = await openSchedule(page, {
    subscription: { plan: 'elite', status: 'past_due' }
  })
  for (let i = 0; i < STARTER_LIMIT - 1; i++) await createEvent(barId)

  // No limite: a grade explica por que parou e leva à assinatura. O jogo
  // entrou direto no banco, e trocar só o hash não recarrega a política.
  await createEvent(barId)
  await page.reload()
  await gotoSchedule(page)
  await expect(page.getByRole('button', { name: 'Novo jogo' })).toBeDisabled()
  const aviso = page.getByRole('region', { name: 'Aviso do plano' })
  await expect(aviso).toContainText(
    'Pagamento pendente — 0 de 5 jogos restantes'
  )
  await expect(
    aviso.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(page.getByRole('link', { name: 'Fazer upgrade' })).toHaveCount(0)

  // E a recusa do servidor não o chama de Starter.
  const response = await page.request.post('/api/trpc/pub.createEvent', {
    data: {
      sportId: await soccerSportId(),
      championship: 'Sexto jogo',
      startsAt: new Date(Date.now() + 86_400_000).toISOString()
    }
  })
  expect(response.status()).toBe(403)
  const refusal = await response.text()
  expect(refusal).toContain('Regularize a assinatura')
  expect(refusal).not.toContain('Starter')
})

for (const plan of ['pro', 'elite'] as const) {
  test(`${plan} não tem limite de jogos`, async ({ page }) => {
    const { barId } = await openSchedule(page, { subscription: { plan } })
    for (let i = 0; i < STARTER_LIMIT + 1; i++) await createEvent(barId)
    await gotoSchedule(page)

    await expect(page.getByRole('button', { name: 'Novo jogo' })).toBeEnabled()
    await expect(
      page.getByRole('region', { name: 'Aviso do plano' })
    ).toHaveCount(0)
  })
}

test('bar inativo não cria jogo, nem pela tela nem pela API', async ({
  page
}) => {
  const { barId } = await openSchedule(page, { bar: { is_active: false } })
  await gotoSchedule(page)

  await expect(page.getByRole('button', { name: 'Novo jogo' })).toBeDisabled()
  await expect(
    page.getByRole('region', { name: 'Aviso do plano' })
  ).toContainText('Seu bar não está visível na plataforma')

  const response = await page.request.post('/api/trpc/pub.createEvent', {
    data: {
      sportId: await soccerSportId(),
      championship: 'Jogo de bar inativo',
      startsAt: new Date(Date.now() + 86_400_000).toISOString()
    }
  })
  expect(response.status()).toBe(403)
  expect(
    await query('SELECT id FROM event WHERE bar_id = $1', [barId])
  ).toEqual([])
})

// O Elite vê quantos vão (Quem vai); o sinal relativo é dos outros planos.
test('o interesse dos torcedores aparece no jogo depois de 5 jogos com presença', async ({
  page
}) => {
  const { barId } = await openSchedule(page, {
    subscription: { plan: 'pro' }
  })
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

// Rascunho (WEB-436): salva sem publicar, fica só no painel e vai ao ar pelo
// "Publicar" da linha.
test('salva um jogo em rascunho, fora do perfil, e publica depois', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  await gotoSchedule(page)

  await page.getByRole('button', { name: 'Novo jogo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('button', { name: 'Futebol', exact: true }).click()
  await dialog.getByLabel('Campeonato', { exact: true }).fill('Rascunho E2E')
  await dialog.getByLabel('Começa').fill(tomorrowAt(21))
  await dialog.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Rascunho E2E' })
  await expect(row).toContainText('Rascunho E2E · rascunho')
  await page.getByRole('button', { name: 'Rascunhos · 1' }).click()
  await expect(row).toHaveCount(1)
  expect(
    await query(
      'SELECT id FROM event WHERE bar_id = $1 AND published_at IS NULL',
      [barId]
    )
  ).toHaveLength(1)

  // O perfil público não mostra o rascunho.
  await page.goto(`/pub/${barId}`)
  await expect(page.getByText('Rascunho E2E')).toHaveCount(0)

  await gotoSchedule(page)
  await row.getByRole('button', { name: /^Publicar/ }).click()
  await expect(row).toContainText('Publicado')
  await expect(
    page.getByRole('button', { name: 'Rascunhos · 0' })
  ).toBeVisible()

  await page.goto(`/pub/${barId}`)
  await expect(page.getByText('Rascunho E2E').first()).toBeVisible()
})

test('no celular a linha do jogo não espreme o nome, e nada rola de lado', async ({
  page
}) => {
  const pub = await openSchedule(page)
  const { eventId } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() + 3 * 3_600_000),
    championship: 'Copa Libertadores da América'
  })
  await query('UPDATE event SET participant_free_text = $2 WHERE id = $1', [
    eventId,
    'São Paulo × Red Bull Bragantino'
  ])
  await gotoSchedule(page)
  const linha = page
    .getByRole('listitem')
    .filter({ hasText: 'Red Bull Bragantino' })
    .getByRole('button')

  for (const largura of [...LARGURAS_CELULAR, 360]) {
    await page.setViewportSize({ width: largura, height: 800 })
    expect(await vazamentoLateral(page), `${largura} px`).toEqual([])
    const [caixaLinha, caixaNome, caixaHora] = await Promise.all([
      linha.boundingBox(),
      linha.locator('b').boundingBox(),
      linha.getByText(/^\d\d:\d\d$/).boundingBox()
    ])
    // O nome ocupa quase a linha toda, embaixo da hora; antes cabia uma
    // palavra por linha numa coluna de ~100 px.
    expect(caixaNome?.width ?? 0).toBeGreaterThan(
      (caixaLinha?.width ?? 0) * 0.6
    )
    expect(caixaNome?.y ?? 0).toBeGreaterThan(caixaHora?.y ?? 0)
  }
})
