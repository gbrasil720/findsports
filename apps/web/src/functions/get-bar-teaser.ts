import {
  ATTENDANCE_DISPLAY_FLOOR,
  readGoing
} from '@findsports_oficial/api/lib/attendance'
import { issuesCounterCode } from '@findsports_oficial/api/lib/current-plan'
import { byMatchOrder } from '@findsports_oficial/api/lib/game-participants'
import { and, db, eq, isNotNull } from '@findsports_oficial/db'
import { isEventLive } from '@findsports_oficial/db/event-window'
import { eventNotEndedSql } from '@findsports_oficial/db/event-window-sql'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createServerFn } from '@tanstack/react-start'

export type BarTeaser = {
  name: string
  neighborhood: string
  city: string
  photoUrl: string | null
  elite: boolean
  next: {
    startsAt: string
    title: string
    live: boolean
    /** `null` abaixo do piso de quem vai (`ATTENDANCE_DISPLAY_FLOOR`). */
    going: number | null
  } | null
}

/**
 * O cartão do bar na página "está no app" (`/pub/$pubId`, design 4x–4z) e o
 * título da prévia de link (WEB-312). Sai sem sessão: o web não mostra mais o
 * perfil do bar a ninguém, só o que o cartão mostra — nome, bairro, se é
 * Elite e o próximo jogo, com quantos vão a partir do mesmo piso do app.
 *
 * `exists` separa o id que nunca existiu (404) do bar fora do ar, que segue
 * 200 sem cartão.
 */
export const getBarTeaser = createServerFn({ method: 'GET' })
  .inputValidator((pubId: string) => String(pubId))
  .handler(async ({ data: pubId }) => {
    const now = new Date()
    const row = await db.query.bar
      .findFirst({
        where: eq(bar.id, pubId),
        columns: {
          name: true,
          neighborhood: true,
          city: true,
          photoUrl: true,
          isActive: true
        },
        with: {
          subscription: {
            columns: { plan: true, status: true, currentPeriodEnd: true }
          },
          events: {
            // Rascunho (WEB-436) não aparece fora do painel.
            where: (event) =>
              and(isNotNull(event.publishedAt), eventNotEndedSql(event, now)),
            orderBy: (event, { asc }) => [asc(event.startsAt)],
            limit: 1,
            columns: {
              id: true,
              startsAt: true,
              endsAt: true,
              championship: true,
              participantFreeText: true
            },
            with: {
              participants: { with: { team: true }, orderBy: byMatchOrder }
            }
          }
        }
      })
      // Id que não é uuid: o Postgres recusa a comparação; é um bar que não existe.
      .catch(() => undefined)
    if (!row) return { exists: false, bar: null }
    if (!row.isActive) return { exists: true, bar: null }

    const game = row.events[0]
    const going = game ? (await readGoing([game.id])).get(game.id) : undefined
    const teaser: BarTeaser = {
      name: row.name,
      neighborhood: row.neighborhood,
      city: row.city,
      photoUrl: row.photoUrl,
      elite: issuesCounterCode(row.subscription ?? null, now),
      next: game
        ? {
            startsAt: new Date(game.startsAt).toISOString(),
            title: gameTitle(game),
            live: isEventLive(game, now),
            going:
              going?.count != null && going.count >= ATTENDANCE_DISPLAY_FLOOR
                ? going.count
                : null
          }
        : null
    }
    return { exists: true, bar: teaser }
  })
