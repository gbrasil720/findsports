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

// "Como foi?" (`/dashboard/avaliar/$eventId`, WEB-178, WEB-451, WEB-501): você
// foi, voltaria, estrelas, o que pesou, comentário, nome e a visita verificada.
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

const avaliar = (eventId: string) => `/dashboard/avaliar/${eventId}`

test('quem teve intenção avalia com estrelas, etiqueta, comentário e nome', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 2)
  const fan = await signInFanAt(page, spot)
  await intent(fan.id, pub.barId, eventId)

  await page.goto(avaliar(eventId))
  await expect(page.getByRole('heading', { name: 'Como foi?' })).toBeVisible()
  // Sem "Vou assistir aqui" não há "Você foi?": a pergunta é só a nota.
  await expect(page.getByRole('heading', { name: 'Você foi?' })).toHaveCount(0)
  const enviar = page.getByRole('button', { name: 'Enviar avaliação' })
  await page.getByRole('button', { name: 'Voltaria', exact: true }).click()
  // Estrelas são obrigatórias na tela nova.
  await expect(enviar).toBeDisabled()
  await page.getByRole('radio', { name: '5 estrelas' }).click()
  await page.getByRole('button', { name: 'Telão' }).click()
  await page.getByLabel('Quer contar mais?').fill('Som alto no segundo tempo.')
  await page
    .getByRole('switch', { name: 'Mostrar meu nome no comentário' })
    .click()
  // Sem código validado nem check-in a faixa de visita verificada não aparece.
  await expect(page.getByText('Visita verificada.')).toHaveCount(0)
  await enviar.click()

  await expect(
    page.getByRole('heading', { name: 'Valeu pela resenha' })
  ).toBeVisible()
  const [rating] = await query(
    `SELECT would_return, stars, reasons, comment, comment_review, identified, verified
       FROM bar_rating WHERE actor_user_id = $1 AND event_id = $2`,
    [fan.id, eventId]
  )
  expect(rating).toEqual({
    would_return: true,
    stars: 5,
    reasons: ['screen'],
    comment: 'Som alto no segundo tempo.',
    comment_review: 'pending',
    identified: true,
    verified: false
  })
})

test('check-in mostra a visita verificada e a nota entra no bar', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 1)
  const fan = await signInFanAt(page, spot)
  await insert('attendance', { user_id: fan.id, event_id: eventId })
  await insert('attendance_checkin', {
    user_id: fan.id,
    event_id: eventId,
    latitude: spot.latitude,
    longitude: spot.longitude,
    distance_m: 20
  })

  await page.goto(avaliar(eventId))
  await page.getByRole('button', { name: 'Fui', exact: true }).click()
  await expect(page.getByText('Visita verificada.')).toBeVisible()
  await page.getByRole('button', { name: 'Não voltaria' }).click()
  await page.getByRole('radio', { name: '2 estrelas' }).click()
  await page.getByRole('button', { name: 'Enviar avaliação' }).click()
  await expect(page.getByText(/Sua nota já conta para o/)).toBeVisible()
  const [rating] = await query(
    'SELECT would_return, stars, verified FROM bar_rating WHERE actor_user_id = $1 AND event_id = $2',
    [fan.id, eventId]
  )
  expect(rating).toEqual({ would_return: false, stars: 2, verified: true })
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
  const eligibleId = await pastGame(eligible.barId, 13)
  await intent(fan.id, eligible.barId, eligibleId)

  let blocked = ''
  for (const item of cases) {
    const eventId = await item.game(item.pub.barId)
    blocked = eventId
    await intent(fan.id, item.pub.barId, eventId, item.type)
    const response = await page.request.post('/api/trpc/ratings.submit', {
      data: { barId: item.pub.barId, eventId, wouldReturn: true }
    })
    expect(response.status()).toBe(403)
    expect((await response.json()).error.message).toBe(item.reason)
  }

  await page.goto(avaliar(eligibleId))
  await expect(
    page.getByRole('button', { name: 'Enviar avaliação' })
  ).toBeVisible()
  await page.goto(avaliar(blocked))
  await expect(page.getByText('Nada para avaliar')).toBeVisible()
})

test('"Não fui" grava a presença e não pede nota', async ({ page }) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 1)
  const fan = await signInFanAt(page, spot)
  await insert('attendance', { user_id: fan.id, event_id: eventId })

  await page.goto(avaliar(eventId))
  await page.getByRole('button', { name: 'Não fui' }).click()
  await expect(page.getByRole('radio', { name: '5 estrelas' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirmar' }).click()

  await expect(page.getByRole('heading', { name: 'Tudo certo' })).toBeVisible()
  const [report] = await query(
    'SELECT attended FROM attendance_report WHERE user_id = $1 AND event_id = $2',
    [fan.id, eventId]
  )
  expect(report).toEqual({ attended: false })
})

// WEB-321: toque errado se corrige pelo "Desfazer".
test('"Desfazer" apaga a resposta e devolve as perguntas', async ({ page }) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const eventId = await pastGame(pub.barId, 2)
  const fan = await signInFanAt(page, spot)
  await insert('attendance', { user_id: fan.id, event_id: eventId })
  const answers = (table: string, actor: string) =>
    query(`SELECT 1 FROM ${table} WHERE ${actor} = $1 AND event_id = $2`, [
      fan.id,
      eventId
    ])

  await page.goto(avaliar(eventId))
  await page.getByRole('button', { name: 'Fui', exact: true }).click()
  await page.getByRole('button', { name: 'Voltaria', exact: true }).click()
  await page.getByRole('radio', { name: '4 estrelas' }).click()
  await page.getByRole('button', { name: 'Enviar avaliação' }).click()
  await expect
    .poll(() => answers('bar_rating', 'actor_user_id'))
    .toHaveLength(1)

  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(
    page.getByRole('button', { name: 'Fui', exact: true })
  ).toBeVisible()
  expect(await answers('bar_rating', 'actor_user_id')).toEqual([])
  expect(await answers('attendance_report', 'user_id')).toEqual([])
  // A nota do bar não guarda o toque desfeito.
  expect(
    await query('SELECT rating_count, rating_positive FROM bar WHERE id = $1', [
      pub.barId
    ])
  ).toEqual([{ rating_count: 0, rating_positive: 0 }])
})
