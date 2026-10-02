import { randomUUID } from 'node:crypto'
import { storageState } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Painel /internal/attendance (WEB-181): bar em que o torcedor diz que foi e
// o bar não registra o código, em jogos com a janela de validação fechada.

test.use({ storageState: storageState('admin') })

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

/**
 * `games` jogos encerrados há dias, cada um com uma reserva confirmada de um
 * torcedor que respondeu "fui" — e nenhum código registrado pelo bar.
 */
async function barWithUnregisteredGames(games: number) {
  const name = `Bar Comparecimento ${randomUUID().slice(0, 8)}`
  const { barId } = await createPub({ bar: { name } })
  const [sport] = await query<{ id: string }>('SELECT id FROM sport LIMIT 1')
  const fan = await createUser()

  for (let game = 0; game < games; game++) {
    const eventId = randomUUID()
    const startsAt = daysAgo(5 + game)
    await insert('event', {
      id: eventId,
      bar_id: barId,
      sport_id: sport?.id,
      championship: `Jogo E2E ${game + 1}`,
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + 2 * 3_600_000)
    })
    await insert('reservation', {
      id: randomUUID(),
      event_id: eventId,
      user_id: fan.id,
      party_size: 2,
      status: 'confirmed'
    })
    await insert('attendance_report', {
      user_id: fan.id,
      event_id: eventId,
      attended: true
    })
  }
  return name
}

test('bar que não registra os códigos aparece no alerta', async ({ page }) => {
  const flagged = await barWithUnregisteredGames(3)
  // Abaixo do piso de três jogos: um padrão isolado não entra.
  const below = await barWithUnregisteredGames(2)

  await page.goto('/internal/attendance')
  const alert = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: flagged, exact: true })
  })
  await expect(alert).toContainText('3 jogos com “foi, mas não registrou”')
  await expect(alert).toContainText('Bar não registra')
  await expect(
    page.getByRole('heading', { name: below, exact: true })
  ).toHaveCount(0)
})
