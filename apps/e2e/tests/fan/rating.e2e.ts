import { randomUUID } from 'node:crypto'
import { insert, query } from '../../fixtures/db'
import {
  createEvent,
  days,
  hours,
  pubAt,
  signInFanAt,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'

// Avaliação "voltaria?" e "você foi?" no dashboard (WEB-178).
//
// Os jogos daqui terminam dias antes ou depois de agora, nunca horas: o
// servidor de dev lê `timestamp` sem fuso no fuso local em parte das
// consultas, e uma margem de horas deixaria o teste depender do fuso da
// máquina.

/** Jogo de duas horas que começou `ago` dias atrás. */
const pastGame = (barId: string, ago: number) =>
  createEvent({
    barId,
    startsAt: days(-ago),
    endsAt: new Date(days(-ago).getTime() + 2 * 3_600_000)
  })

/** Intenção registrada direto no banco, como `/api/bar/commercial-event` grava. */
async function intent(
  fanId: string,
  barId: string,
  eventId: string,
  type = 'directions_opened'
) {
  await insert('bar_commercial_event', {
    id: randomUUID(),
    bar_id: barId,
    actor_user_id: fanId,
    type,
    source_event_id: eventId,
    occurred_at: new Date(),
    commercial_day: new Date().toISOString().slice(0, 10)
  })
}

const question = (name: string) => `Voltaria pra ver jogo no ${name}?`

test('quem abriu a rota de um jogo que acabou responde "voltaria?"', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 2)
  const fan = await signInFanAt(page, spot)

  // A intenção nasce na página do bar, vinda do jogo pelo `eventId`.
  await page.goto(`/pub/${pub.barId}?eventId=${eventId}`)
  const popup = page.waitForEvent('popup')
  await page
    // Bar sem WhatsApp nem telefone: o painel de ações é só a rota.
    .locator('section', {
      has: page.locator('p.onside-kicker', { hasText: 'Como chegar' })
    })
    .locator('a[href*="google.com/maps"]')
    .click()
  await (await popup).close()
  await expect
    .poll(
      async () =>
        (
          await query(
            `SELECT 1 FROM bar_commercial_event
           WHERE actor_user_id = $1 AND source_event_id = $2 AND type = 'directions_opened'`,
            [fan.id, eventId]
          )
        ).length
    )
    .toBe(1)

  await page.goto('/dashboard')
  await expect(
    page.getByRole('heading', { name: question(pub.name) })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Voltaria', exact: true }).click()
  await expect(
    page.getByText('Obrigado! Sua resposta ajuda outros torcedores.')
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: question(pub.name) })
  ).toHaveCount(0)
  const [rating] = await query(
    'SELECT would_return FROM bar_rating WHERE actor_user_id = $1 AND event_id = $2',
    [fan.id, eventId]
  )
  expect(rating).toEqual({ would_return: true })
})

test('sem intenção, antes do fim ou depois de 14 dias não há avaliação', async ({
  page
}) => {
  const spot = uniqueSpot()
  const fan = await signInFanAt(page, spot)
  const cases = [
    {
      // só viu o perfil: não conta como intenção
      pub: await pubAt(spot),
      type: 'profile_view',
      game: (barId: string) => pastGame(barId, 2),
      reason: 'Só quem demonstrou interesse em ir a este jogo pode avaliar.'
    },
    {
      pub: await pubAt(spot),
      type: 'whatsapp_opened',
      game: (barId: string) =>
        createEvent({ barId, startsAt: hours(-0.5), endsAt: days(1) }),
      reason: 'O jogo ainda não acabou.'
    },
    {
      pub: await pubAt(spot),
      type: 'phone_clicked',
      game: (barId: string) => pastGame(barId, 15),
      reason: 'A avaliação fecha 14 dias depois do jogo.'
    }
  ]
  const eligible = await pubAt(spot)
  await intent(fan.id, eligible.barId, await pastGame(eligible.barId, 13))

  for (const item of cases) {
    const eventId = await item.game(item.pub.barId)
    await intent(fan.id, item.pub.barId, eventId, item.type)
    const response = await page.request.post('/api/trpc/ratings.submit', {
      data: { barId: item.pub.barId, eventId, wouldReturn: true }
    })
    expect(response.status()).toBe(403)
    expect((await response.json()).error.message).toBe(item.reason)
  }

  await page.goto('/dashboard')
  // Só o jogo de 13 dias atrás, e ele sozinho (sem "1 de N").
  await expect(
    page.getByRole('heading', { name: question(eligible.name) })
  ).toBeVisible()
  await expect(page.getByText(/^1 de \d/)).toHaveCount(0)
})

test('"você foi?" pergunta depois do jogo marcado e grava a resposta', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 1)
  const fan = await signInFanAt(page, spot)
  await insert('attendance', { user_id: fan.id, event_id: eventId })

  await page.goto('/dashboard')
  const card = page.getByRole('region', { name: `Você foi ao ${pub.name}?` })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Fui', exact: true }).click()

  await expect(card).toHaveCount(0)
  await expect(page.getByText('Resposta registrada. Obrigado!')).toBeAttached()
  const [report] = await query(
    'SELECT attended FROM attendance_report WHERE user_id = $1 AND event_id = $2',
    [fan.id, eventId]
  )
  expect(report).toEqual({ attended: true })
})

// WEB-321: toque errado se corrige pelo "Desfazer" do aviso de confirmação.
test('"Desfazer" no aviso apaga a resposta e devolve a pergunta', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 2)
  const fan = await signInFanAt(page, spot)
  await intent(fan.id, pub.barId, eventId)
  await insert('attendance', { user_id: fan.id, event_id: eventId })
  const undo = (message: string) =>
    page
      .locator('[data-sonner-toast]', { hasText: message })
      .getByRole('button', { name: 'Desfazer' })
  const answers = (table: string, actor: string) =>
    query(`SELECT 1 FROM ${table} WHERE ${actor} = $1 AND event_id = $2`, [
      fan.id,
      eventId
    ])

  await page.goto('/dashboard')
  const went = page.getByRole('region', { name: `Você foi ao ${pub.name}?` })
  await went.getByRole('button', { name: 'Não fui' }).click()
  await expect(went).toHaveCount(0)
  await undo('Resposta registrada. Obrigado!').click()
  await expect(
    went.getByRole('button', { name: 'Fui', exact: true })
  ).toBeVisible()
  expect(await answers('attendance_report', 'user_id')).toEqual([])

  const rate = page.getByRole('region', { name: question(pub.name) })
  await rate.getByRole('button', { name: 'Não voltaria' }).click()
  await expect(rate).toHaveCount(0)
  // Pelo teclado também: o botão do aviso recebe foco e responde ao Enter.
  await undo('Obrigado! Sua resposta ajuda outros torcedores.').focus()
  await page.keyboard.press('Enter')
  await expect(
    rate.getByRole('button', { name: 'Voltaria', exact: true })
  ).toBeVisible()
  expect(await answers('bar_rating', 'actor_user_id')).toEqual([])
  // A nota do bar não guarda o toque desfeito.
  expect(
    await query('SELECT rating_count, rating_positive FROM bar WHERE id = $1', [
      pub.barId
    ])
  ).toEqual([{ rating_count: 0, rating_positive: 0 }])
})
