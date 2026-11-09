import { randomUUID } from 'node:crypto'
import { insert, query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { createEvent, days } from '../../fixtures/fan'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "O que dizem" da página pública do bar (WEB-408, WEB-451): só com 5
// avaliações verificadas, e então a média das estrelas, as etiquetas e os
// comentários aprovados. Serial porque liga `rating.public_display`, global.

test.afterEach(resetAppConfig)

type Rating = {
  wouldReturn?: boolean
  stars?: number
  comment?: string
  review?: 'approved' | 'pending'
  identified?: boolean
  verified?: boolean
}

async function rate(barId: string, eventId: string, name: string, r: Rating) {
  const fan = await createUser({ name })
  // Verificada: check-in no jogo. O banco marca pela trigger da avaliação.
  if (r.verified !== false) {
    await insert('attendance_checkin', {
      user_id: fan.id,
      event_id: eventId,
      latitude: -23.55,
      longitude: -46.63,
      distance_m: 10
    })
  }
  await insert('bar_rating', {
    id: randomUUID(),
    bar_id: barId,
    actor_user_id: fan.id,
    event_id: eventId,
    would_return: r.wouldReturn ?? true,
    stars: r.stars ?? 5,
    reasons: ['sound'],
    comment: r.comment ?? null,
    comment_review: r.comment ? (r.review ?? 'approved') : null,
    identified: r.identified ?? false
  })
}

test('abaixo de 5 verificadas a seção espera; acima, nota, estrelas e comentários aprovados', async ({
  page
}) => {
  await setAppConfig('rating.public_display', true)
  const pub = await createPub()
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(-2),
    freeText: 'Jogo avaliado'
  })
  await createEvent({ barId: pub.barId, startsAt: days(1) })
  const section = page.getByRole('region', { name: 'O que dizem' })

  await rate(pub.barId, eventId, 'Carol Mendes', {
    comment: 'Telão de qualquer mesa.',
    identified: true
  })
  await rate(pub.barId, eventId, 'Anônima', {
    stars: 4,
    comment: 'Lota cedo em clássico.'
  })
  await rate(pub.barId, eventId, 'Em revisão', {
    stars: 4,
    comment: 'Ainda não aprovado.',
    review: 'pending'
  })
  await rate(pub.barId, eventId, 'Quarta', { wouldReturn: false, stars: 3 })
  // Não verificada: não conta nem aparece.
  await rate(pub.barId, eventId, 'Nunca foi', {
    stars: 1,
    comment: 'Nem fui.',
    verified: false
  })

  await page.goto(`/pub/${pub.barId}`)
  await expect(section).toContainText('As primeiras avaliações estão chegando')
  await expect(section).not.toContainText('voltariam')
  await expect(page.locator('.hero')).not.toContainText('voltariam')
  const html = await (await page.request.get(page.url())).text()
  expect(html).not.toContain('AggregateRating')

  await rate(pub.barId, eventId, 'Quinta', { stars: 5 })
  const [counts] = await query<{ rating_count: number }>(
    'SELECT rating_count FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(counts?.rating_count).toBe(5)

  await page.reload()
  await expect(section).toContainText('80%')
  await expect(section).toContainText('de 5 avaliações verificadas')
  await expect(section).toContainText('4,2')
  await expect(page.locator('.hero')).toContainText('4,2 · 80% voltariam')
  const quotes = section.locator('blockquote')
  await expect(quotes).toHaveCount(2)
  await expect(section).toContainText('“Telão de qualquer mesa.”')
  await expect(section).toContainText('Carol · Jogo avaliado')
  await expect(section).toContainText('Visita verificada · Jogo avaliado')
  await expect(section).not.toContainText('Ainda não aprovado.')
  await expect(section).not.toContainText('Nem fui.')
  const after = await (await page.request.get(page.url())).text()
  expect(after).toContain('"ratingValue":4.2,"bestRating":5')
})
