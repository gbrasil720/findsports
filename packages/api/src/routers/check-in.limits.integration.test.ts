import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  ageAccounts,
  contextFor,
  load,
  refusal,
  seedBar
} from './integration-seed'

/*
 * Relatório de vulnerabilidades de 20/11/2026 (decisão do dono, 20/11):
 * - check-in de conta com menos de 7 dias conta como visita, mas não
 *   verifica a avaliação;
 * - no máximo 2 check-ins por conta no dia de Brasília;
 * - a ficha do bar no Houdini mostra a semana com 3+ verificadas de contas
 *   com menos de 30 dias.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000
const BAR = { latitude: -23.55052, longitude: -46.633308 }

integrationTest(
  'check-in de conta nova, teto diário e sinal no Houdini',
  async () => {
    const [{ appRouter }, { checkIn }, { visit }] = await Promise.all([
      load(),
      import('../lib/check-in'),
      import('../lib/visits')
    ])
    const seeded = await seedBar('elite', 'active', null)
    const { db } = seeded
    const fans = Array.from({ length: 5 }, () => crypto.randomUUID())
    await db.insert(user).values(
      fans.map((id) => ({
        id,
        name: `Torcedor ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      }))
    )
    const [young, old, r1, r2, r3] = fans as [
      string,
      string,
      string,
      string,
      string
    ]
    try {
      const startsAt = new Date(Date.now() - 6 * HOUR)
      const past = await seeded.seedGame({ startsAt })
      const during = new Date(startsAt.getTime() + HOUR)
      const rate = (id: string) =>
        db.insert(barRating).values({
          barId: seeded.barId,
          actorUserId: id,
          eventId: past,
          wouldReturn: false,
          stars: 1
        })
      const verified = async (id: string) =>
        (
          await db
            .select({ verified: barRating.verified })
            .from(barRating)
            .where(
              and(eq(barRating.actorUserId, id), eq(barRating.eventId, past))
            )
        )[0]?.verified

      // --- conta nova: visita sim, nota não ------------------------------

      await ageAccounts([old])
      await checkIn(young, { eventId: past, ...BAR }, during)
      await checkIn(old, { eventId: past, ...BAR }, during)
      await rate(young)
      await rate(old)
      expect(await verified(young)).toBe(false)
      expect(await verified(old)).toBe(true)
      const visits = await db
        .select({ userId: visit.userId })
        .from(visit)
        .where(and(eq(visit.eventId, past), inArray(visit.userId, fans)))
      expect(visits.map((v) => v.userId).sort()).toEqual([old, young].sort())

      // --- teto de 2 por dia de Brasília ---------------------------------

      const live = () =>
        seeded.seedGame({ startsAt: new Date(Date.now() - 0.5 * HOUR) })
      const [g1, g2, g3] = [await live(), await live(), await live()]
      const fan = appRouter.createCaller(contextFor(r1, 'fan'))
      await fan.attendance.checkIn({ eventId: g1, ...BAR })
      await fan.attendance.checkIn({ eventId: g2, ...BAR })
      const over = await refusal(
        fan.attendance.checkIn({ eventId: g3, ...BAR })
      )
      expect(over.code).toBe('TOO_MANY_REQUESTS')
      expect(over.message).toBe('Você já fez 2 check-ins hoje. Volte amanhã.')
      // Repetir um jogo do dia não é check-in novo.
      expect(await fan.attendance.checkIn({ eventId: g1, ...BAR })).toEqual({
        checkedIn: true
      })

      // --- sinal no Houdini ----------------------------------------------

      const admin = appRouter.createCaller(
        contextFor(crypto.randomUUID(), 'admin')
      )
      const ficha = () => admin.adminBars.ficha({ barId: seeded.barId })
      // `old` tem 8 dias: já é uma conta com menos de 30.
      await ageAccounts([r2, r3], 10)
      await checkIn(r2, { eventId: past, ...BAR }, during)
      await rate(r2)
      expect((await ficha()).youngRaterWeeks).toEqual([])
      await checkIn(r3, { eventId: past, ...BAR }, during)
      await rate(r3)
      expect((await ficha()).youngRaterWeeks).toEqual([
        { week: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), n: 3 }
      ])
      // Conta de 30 dias ou mais na hora de avaliar sai da conta.
      await ageAccounts([old, r2, r3], 40)
      expect((await ficha()).youngRaterWeeks).toEqual([])
    } finally {
      await db.delete(user).where(inArray(user.id, fans))
      await seeded.cleanup()
    }
  }
)
