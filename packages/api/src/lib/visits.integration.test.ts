import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { load } from '../routers/integration-seed'

/**
 * A visita (`visits.ts`) contra o banco de verdade: código validado e não
 * desfeito vira uma visita por torcedor e jogo, com a primeira validação.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

integrationTest(
  'uma visita por jogo, com a primeira validação; desfeita não conta',
  async () => {
    const { db } = await load()
    const { visit } = await import('./visits')
    const ownerId = crypto.randomUUID()
    const fanId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    await db.insert(user).values(
      [
        { id: ownerId, role: 'pub' as const },
        { id: fanId, role: 'fan' as const }
      ].map((account) => ({
        ...account,
        name: `Conta ${account.role}`,
        email: `${account.id}@integration.invalid`,
        emailVerified: true
      }))
    )
    try {
      await db.insert(bar).values({
        id: barId,
        userId: ownerId,
        name: 'Bar da visita',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: true
      })
      await db
        .insert(sport)
        .values({ id: sportId, name: sportId, slug: `visit-${sportId}` })
      const [twice, undone, never] = await db
        .insert(event)
        .values(
          [1, 2, 3].map((n) => ({
            barId,
            sportId,
            championship: 'Campeonato da visita',
            startsAt: new Date(Date.now() - n * 24 * HOUR)
          }))
        )
        .returning({ id: event.id })
        .then((rows) => rows.map((row) => row.id))

      /** Ingresso de duas pessoas, com um uso em cada `usedAt`. */
      const ticket = async (eventId: string, uses: Date[]) => {
        const [created] = await db
          .insert(reservation)
          .values({ eventId, userId: fanId, partySize: 2, status: 'confirmed' })
          .returning({ id: reservation.id })
        const [code] = await db
          .insert(reservationCode)
          .values({
            code: generateReservationCode(),
            reservationId: created?.id as string,
            maxUses: 2
          })
          .returning({ id: reservationCode.id })
        if (!uses.length) return []
        return db
          .insert(reservationCodeUse)
          .values(
            uses.map((usedAt) => ({ codeId: code?.id as string, usedAt }))
          )
          .returning({ id: reservationCodeUse.id })
      }
      const first = new Date(Date.now() - 30 * HOUR)
      await ticket(twice as string, [new Date(Date.now() - 29 * HOUR), first])
      const [use] = await ticket(undone as string, [new Date()])
      await db
        .update(reservationCodeUse)
        .set({ undoneAt: new Date(Date.now() + 1000) })
        .where(eq(reservationCodeUse.id, use?.id as string))
      await ticket(never as string, [])

      expect(
        await db.select().from(visit).where(eq(visit.userId, fanId))
      ).toEqual([
        { userId: fanId, eventId: twice as string, barId, visitedAt: first }
      ])
    } finally {
      await db.delete(user).where(inArray(user.id, [ownerId, fanId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
