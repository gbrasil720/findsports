import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent, createTicket, soccerSportId } from '../../fixtures/going'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Jogos (painel novo, WEB-501): criar pela folha "Novo jogo", editar e
// excluir pelo jogo aberto, limite de jogos por plano e sinal de interesse.

const STARTER_LIMIT = 5

/** Título do aviso no limite, com o fim do ciclo de cobrança (WEB-353). */
const LIMIT_REACHED_UNTIL = /Limite de jogos atingido até \d{1,2} de [a-zç]+/

async function openSchedule(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  return pub
}

async function gotoSchedule(page: Page) {
  await page.goto('/admin/jogos')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Jogos' })
  ).toBeVisible()
}

/** Amanhã no campo "Dia" (`dd/mm/aaaa`), no fuso do navegador (São Paulo). */
function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
}

// O do cabeçalho; com a grade vazia, o vazio repete o botão.
const newGame = (page: Page) =>
  page.getByRole('button', { name: 'Novo jogo', exact: true }).first()

/** A folha "Novo jogo" com esporte, campeonato e amanhã às `hour`h. */
async function fillNewGame(page: Page, championship: string, hour = 21) {
  await newGame(page).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await dialog.getByRole('radio', { name: 'Futebol', exact: true }).check()
  await dialog.getByLabel('Campeonato').fill(championship)
  await dialog.getByLabel('Dia', { exact: true }).fill(tomorrow())
  await dialog
    .getByLabel('Horário', { exact: true })
    .fill(`${String(hour).padStart(2, '0')}:00`)
  return dialog
}

/**
 * Botão do rodapé da folha pelo teclado: em `vite dev` o botão das devtools
 * fica sobre o canto de baixo no celular.
 */
async function press(page: Page, button: ReturnType<Page['getByRole']>) {
  await button.focus()
  await page.keyboard.press('Enter')
}

/** Abre o jogo: à direita no computador, numa folha no celular. */
async function openGame(page: Page, text: string) {
  await page.getByRole('listitem').filter({ hasText: text }).click()
  return page.getByLabel('Jogo aberto')
}

/** Três times de futebol semeados, em ordem alfabética. */
async function soccerTeams(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT t.name FROM team t JOIN sport s ON s.id = t.sport_id
     WHERE s.slug = 'futebol' AND t.featured ORDER BY t.name LIMIT 3`
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

  const dialog = await fillNewGame(page, 'Brasileirão E2E')
  await dialog.getByRole('button', { name: home, exact: true }).click()
  await dialog.getByRole('button', { name: away, exact: true }).click()
  // Futebol é confronto direto: o terceiro time fica travado.
  await expect(
    dialog.getByRole('button', { name: other, exact: true })
  ).toBeDisabled()
  await press(page, dialog.getByRole('button', { name: 'Publicar jogo' }))
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Brasileirão E2E' })
  await expect(row).toContainText(home)
  await expect(row).toContainText(away)
  await expect(row).toContainText('PUBLICADO')
  expect(await participantsOf(barId)).toEqual([home, away])

  let game = await openGame(page, 'Brasileirão E2E')
  await game.getByRole('button', { name: 'Editar', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar jogo' })
  await expect(edit.getByLabel('Campeonato')).toHaveValue('Brasileirão E2E')
  await edit.getByLabel('Campeonato').fill('Copa E2E')
  await edit.getByRole('button', { name: away, exact: true }).click()
  await edit.getByRole('button', { name: other, exact: true }).click()
  await press(page, edit.getByRole('button', { name: 'Salvar alterações' }))
  await expect(edit).toBeHidden()

  const edited = page.getByRole('listitem').filter({ hasText: 'Copa E2E' })
  await expect(edited).toContainText(other)
  await expect(edited).not.toContainText(away)
  expect(await participantsOf(barId)).toEqual([home, other])

  // Excluir pede confirmação: cancelar não apaga nada.
  game = page.getByLabel('Jogo aberto')
  await game.getByRole('button', { name: 'Excluir', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Excluir este jogo?' })
  await expect(confirm).toContainText('sai da sua grade e do seu perfil')
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirm).toBeHidden()
  await expect(edited).toHaveCount(1)

  await game.getByRole('button', { name: 'Excluir', exact: true }).click()
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
  const dialog = await fillNewGame(page, 'Ordem E2E')
  await dialog.getByRole('button', { name: second, exact: true }).click()
  await dialog.getByRole('button', { name: first, exact: true }).click()
  await expect(dialog).toContainText(`Confronto: ${second} × ${first}`)
  await press(page, dialog.getByRole('button', { name: 'Publicar jogo' }))
  await expect(dialog).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: 'Ordem E2E' })
  await expect(row).toContainText(`${second} × ${first}`)
  await page.goto(`/pub/${barId}`)
  await expect(page.getByText(`${second} × ${first}`).first()).toBeVisible()

  // Editar abre na ordem gravada; inverter troca mandante e visitante.
  await gotoSchedule(page)
  const game = await openGame(page, 'Ordem E2E')
  await game.getByRole('button', { name: 'Editar', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar jogo' })
  await expect(edit).toContainText(`Confronto: ${second} × ${first}`)
  await edit.getByRole('button', { name: 'Inverter' }).click()
  await expect(edit).toContainText(`Confronto: ${first} × ${second}`)
  await press(page, edit.getByRole('button', { name: 'Salvar alterações' }))
  await expect(edit).toBeHidden()

  await expect(row).toContainText(`${first} × ${second}`)
  await page.goto(`/pub/${barId}`)
  await expect(page.getByText(`${first} × ${second}`).first()).toBeVisible()
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

  let game = await openGame(page, 'Bloqueado E2E')
  await game.getByRole('button', { name: 'Excluir', exact: true }).click()
  const refusal = page.getByRole('dialog', {
    name: 'Este jogo não pode ser excluído'
  })
  await expect(refusal).toContainText('Este jogo tem 1 código de quem vai.')
  await expect(
    refusal.getByRole('button', { name: 'Excluir jogo' })
  ).toHaveCount(0)
  await refusal.getByRole('button', { name: 'Entendi' }).click()
  await expect(refusal).toBeHidden()
  // No celular o jogo aberto é uma folha: fecha antes do próximo.
  await page.keyboard.press('Escape')

  // A tela esconder o botão não é a regra: o servidor recusa também.
  const response = await page.request.post('/api/trpc/pub.deleteEvent', {
    data: { eventId: blocked.eventId }
  })
  expect(response.status()).toBe(412)

  game = await openGame(page, 'Liberado E2E')
  await game.getByRole('button', { name: 'Excluir', exact: true }).click()
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

test('término antes do início não deixa salvar', async ({ page }) => {
  await openSchedule(page)
  await gotoSchedule(page)

  const dialog = await fillNewGame(page, 'Brasileirão E2E', 21)
  await dialog.getByLabel('Termina às · opcional').fill('20:00')
  await expect(
    dialog.getByText('Término deve ser posterior ao início.')
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Publicar jogo' })
  ).toBeDisabled()
})

test('o que falta preencher trava o publicar e é dito', async ({ page }) => {
  await openSchedule(page)
  await gotoSchedule(page)

  await newGame(page).click()
  const dialog = page.getByRole('dialog', { name: 'Novo jogo' })
  await expect(dialog).toContainText(
    'Para salvar, falta preencher: esporte, campeonato (pelo menos 2 caracteres), dia e horário.'
  )
  await expect(
    dialog.getByRole('button', { name: 'Publicar jogo' })
  ).toBeDisabled()
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
  const dialog = await fillNewGame(page, 'Quinto jogo E2E')
  await press(page, dialog.getByRole('button', { name: 'Publicar jogo' }))
  await expect(dialog).toBeHidden()

  // No limite: botão travado, motivo e caminho para o upgrade.
  await expect(newGame(page)).toBeDisabled()
  await expect(page.getByText('Limite do plano atingido.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fazer upgrade' }).first()
  ).toHaveAttribute('href', '/plan')

  // WEB-353: Hoje diz até quando o limite vale (o fim do ciclo, não "este
  // mês") e não oferece "Novo jogo" como ação disponível.
  await page.goto('/admin')
  const hoje = page.locator('#painel-main')
  await expect(hoje).toContainText(LIMIT_REACHED_UNTIL)
  await expect(hoje).not.toContainText('este mês')
  await expect(newGame(page)).toHaveCount(0)
  await hoje.getByRole('link', { name: 'Ver grade' }).first().click()
  await expect(page).toHaveURL(/\/admin\/jogos$/)
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

  // Antes do limite: Hoje já diz quantos jogos restam.
  await page.goto('/admin')
  const hoje = page.locator('#painel-main')
  await expect(hoje).toContainText(
    `Pagamento pendente — 1 de ${STARTER_LIMIT} jogos restantes`
  )
  await expect(hoje).toContainText('Pagamento pendente · 1 restante')
  await expect(newGame(page)).toBeVisible()
  await expect(
    hoje.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')

  // No limite: a grade explica por que parou e leva à assinatura. O jogo
  // entrou direto no banco: a página nova recarrega a política.
  await createEvent(barId)
  await gotoSchedule(page)
  await expect(newGame(page)).toBeDisabled()
  await expect(
    page.getByText(
      'Plano Elite com pagamento pendente: limite de jogos atingido.'
    )
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' }).first()
  ).toHaveAttribute('href', '/admin/billing')
  await expect(page.getByRole('link', { name: 'Fazer upgrade' })).toHaveCount(0)

  await page.goto('/admin')
  await expect(hoje).toContainText(LIMIT_REACHED_UNTIL)
  await expect(
    hoje.getByRole('link', { name: 'Ver grade' }).first()
  ).toBeVisible()
  await expect(hoje).toContainText('Pagamento pendente · 0 restantes')
  await expect(hoje.getByRole('link', { name: 'Fazer upgrade' })).toHaveCount(0)

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

    await expect(newGame(page)).toBeEnabled()
    await expect(page.getByText('Limite do plano atingido.')).toHaveCount(0)
  })
}

test('bar inativo não cria jogo, nem pela tela nem pela API', async ({
  page
}) => {
  const { barId } = await openSchedule(page, { bar: { is_active: false } })
  await gotoSchedule(page)

  await expect(newGame(page)).toBeDisabled()
  await expect(
    page.getByText('Ative um plano para adicionar eventos.').first()
  ).toBeVisible()

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

// Rascunho (WEB-436): só o painel vê. Fica fora do perfil público e de
// Próximos, aparece em Rascunhos e vai ao ar pelo "Publicar" do jogo aberto.
test('rascunho fica fora do perfil público e vai ao ar pelo Publicar', async ({
  page
}) => {
  const { barId } = await openSchedule(page)
  await gotoSchedule(page)

  const dialog = await fillNewGame(page, 'Rascunho E2E')
  await press(page, dialog.getByRole('button', { name: 'Salvar rascunho' }))
  await expect(dialog).toBeHidden()

  const [draft] = await query<{ published_at: Date | null }>(
    'SELECT published_at FROM event WHERE bar_id = $1',
    [barId]
  )
  expect(draft?.published_at).toBeNull()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Rascunho E2E' })
  ).toHaveCount(0)

  // O perfil do bar (o que o torcedor vê) não mostra o rascunho.
  await page.goto(`/pub/${barId}`)
  await expect(page.locator('body')).not.toContainText('Rascunho E2E')
  const profile = await page.request.get(
    `/api/trpc/pubs.getById?input=${encodeURIComponent(JSON.stringify({ id: barId }))}`
  )
  expect(JSON.stringify(await profile.json())).not.toContain('Rascunho E2E')

  await gotoSchedule(page)
  await page.getByRole('tab', { name: /^Rascunhos/ }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Rascunho E2E' })
  await expect(row).toContainText('RASCUNHO')
  const game = await openGame(page, 'Rascunho E2E')
  await game.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect
    .poll(
      async () =>
        (
          await query<{ published_at: Date | null }>(
            'SELECT published_at FROM event WHERE bar_id = $1',
            [barId]
          )
        )[0]?.published_at ?? null
    )
    .not.toBeNull()

  await page.goto(`/pub/${barId}`)
  await expect(page.getByText('Rascunho E2E').first()).toBeVisible()
})

// Oferta, telão, som e lista por jogo (WEB-422, WEB-399, WEB-437): a folha
// troca a oferta só deste jogo e o jogo aberto desliga na hora.
test('oferta da casa trocada e desligada por jogo, e telão e lista no jogo aberto', async ({
  page
}) => {
  const { barId } = await openSchedule(page, {
    bar: { house_offer: 'Chopp em dobro', amenities: [1, 2] }
  })
  await gotoSchedule(page)

  const dialog = await fillNewGame(page, 'Oferta E2E')
  await expect(
    dialog.getByRole('textbox', { name: 'Oferta da casa neste jogo' })
  ).toHaveValue('Chopp em dobro')
  await dialog
    .getByRole('textbox', { name: 'Oferta da casa neste jogo' })
    .fill('Batata grátis')
  await press(page, dialog.getByRole('button', { name: 'Publicar jogo' }))
  await expect(dialog).toBeHidden()

  const gameRow = async () =>
    (
      await query<{
        house_offer: string | null
        no_house_offer: boolean
        on_big_screen: boolean | null
        attendance_enabled: boolean
      }>(
        `SELECT house_offer, no_house_offer, on_big_screen, attendance_enabled
         FROM event WHERE bar_id = $1`,
        [barId]
      )
    )[0]
  expect(await gameRow()).toEqual({
    house_offer: 'Batata grátis',
    no_house_offer: false,
    // Telão sem mexer herda das características.
    on_big_screen: null,
    attendance_enabled: true
  })

  // O torcedor vê a oferta deste jogo, não a padrão.
  const offerOnProfile = async () => {
    const response = await page.request.get(
      `/api/trpc/pubs.getById?input=${encodeURIComponent(JSON.stringify({ id: barId }))}`
    )
    const body = await response.json()
    return body.result.data.events[0]?.houseOffer ?? null
  }
  expect(await offerOnProfile()).toBe('Batata grátis')

  const game = await openGame(page, 'Oferta E2E')
  await game.getByRole('switch', { name: 'Oferta da casa neste jogo' }).click()
  await expect.poll(async () => (await gameRow())?.no_house_offer).toBe(true)
  expect(await offerOnProfile()).toBeNull()

  await game.getByRole('switch', { name: 'Passa no telão' }).click()
  await expect.poll(async () => (await gameRow())?.on_big_screen).toBe(false)
  await game
    .getByRole('switch', { name: 'Lista de quem vai neste jogo' })
    .click()
  await expect
    .poll(async () => (await gameRow())?.attendance_enabled)
    .toBe(false)
})

test('fora do Elite a folha não tem oferta nem lista por jogo', async ({
  page
}) => {
  await openSchedule(page, { subscription: { plan: 'pro' } })
  await gotoSchedule(page)
  const dialog = await fillNewGame(page, 'Pro E2E')
  await expect(
    dialog.getByRole('switch', { name: 'Passa no telão' })
  ).toBeVisible()
  await expect(
    dialog.getByRole('switch', { name: 'Oferta da casa neste jogo' })
  ).toHaveCount(0)
  await expect(
    dialog.getByRole('switch', { name: 'Lista de quem vai neste jogo' })
  ).toHaveCount(0)
})
