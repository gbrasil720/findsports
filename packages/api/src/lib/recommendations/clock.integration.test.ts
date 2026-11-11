import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { barCommercialEvent } from '@findsports_oficial/db/schema/analytics'
import {
  eventParticipants,
  sport,
  team,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, seedBar, withClock } from '../../routers/integration-seed'
import { loadRecommendationFacts } from './facts'
import { loadRecommendationCandidates } from './load-candidates'
import { hydrateRound, readExpansion } from './round-store'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000
// O bar de `seedBar`.
const ORIGIN = { lat: -23.55052, lng: -46.633308 }

/**
 * "Jogo que ainda vai começar" nas recomendações. O `now` entrava cru no SQL:
 * o driver o escreve no fuso do processo e a coluna `timestamp` joga o
 * deslocamento fora, então num processo em Brasília o jogo que começou há
 * até 3 h ainda era o próximo. Roda com o processo em Brasília e a sessão
 * em UTC e em Brasília.
 */
for (const session of ['UTC', 'America/Sao_Paulo']) {
  integrationTest(
    `recomendações só contam jogo que ainda vai começar (sessão ${session})`,
    () =>
      withClock({ session, process: 'America/Sao_Paulo' }, async () => {
        const seed = await seedBar('elite', 'active', inAMonth())
        const now = new Date()
        const preferred = crypto.randomUUID()
        const other = crypto.randomUUID()
        const startedTeam = crypto.randomUUID()
        const nextTeam = crypto.randomUUID()
        try {
          await seed.db.insert(sport).values([
            { id: preferred, name: `Preferido ${preferred}`, slug: preferred },
            { id: other, name: `Outro ${other}`, slug: other }
          ])
          await seed.db.insert(team).values([
            {
              id: startedTeam,
              sportId: preferred,
              name: 'Time que já começou',
              slug: startedTeam
            },
            {
              id: nextTeam,
              sportId: preferred,
              name: 'Time do próximo',
              slug: nextTeam
            }
          ])
          await seed.db
            .insert(userPreferenceSports)
            .values({ userId: seed.fanId, sportId: preferred })
          const started = await seed.seedGame({
            sportId: preferred,
            startsAt: new Date(now.getTime() - 2 * HOUR)
          })
          const next = await seed.seedGame({
            sportId: preferred,
            startsAt: new Date(now.getTime() + 24 * HOUR)
          })
          await seed.seedGame({
            sportId: other,
            startsAt: new Date(now.getTime() - 2 * HOUR)
          })
          await seed.db.insert(eventParticipants).values([
            { eventId: started, teamId: startedTeam },
            { eventId: next, teamId: nextTeam }
          ])
          await seed.db.insert(barCommercialEvent).values(
            [started, next].map((sourceEventId) => ({
              id: crypto.randomUUID(),
              barId: seed.barId,
              actorUserId: seed.fanId,
              type: 'profile_view' as const,
              sourceEventId,
              occurredAt: now,
              commercialDay: brasiliaDay(now)
            }))
          )

          const candidates = await loadRecommendationCandidates({
            userId: seed.fanId,
            ...ORIGIN,
            radiusKm: 3,
            now
          })
          const mine = candidates.find((bar) => bar.id === seed.barId)
          expect(mine?.nextEvent?.id).toBe(next)

          const facts = await loadRecommendationFacts({
            userId: seed.fanId,
            items: [
              {
                bar: {
                  id: seed.barId,
                  intentActions: [],
                  amenities: [],
                  matchedSportName: null
                }
              }
            ] as never,
            now
          })
          expect(facts.get(seed.barId)?.team).toBe('Time do próximo')

          const round = await hydrateRound(
            seed.fanId,
            {
              runId: crypto.randomUUID(),
              day: brasiliaDay(now),
              radiusKm: 3,
              items: [{ barId: seed.barId }]
            } as never,
            now
          )
          expect(round.items[0]?.game?.id).toBe(next)

          const expansion = await readExpansion({
            userId: seed.fanId,
            where: ORIGIN,
            radiusKm: 3,
            exclude: [],
            now
          })
          expect(expansion?.sports.map((s) => s.id)).not.toContain(other)
        } finally {
          await seed.db
            .delete(barCommercialEvent)
            .where(inArray(barCommercialEvent.barId, [seed.barId]))
          await seed.cleanup()
          await seed.db
            .delete(sport)
            .where(inArray(sport.id, [preferred, other]))
        }
      })
  )
}
