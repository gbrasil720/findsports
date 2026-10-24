import { expect, test } from 'bun:test'
import { and, eq, sql } from '@findsports_oficial/db'
import {
  attendance,
  attendanceReport
} from '@findsports_oficial/db/schema/attendance'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * Pós-jogo numa fila só (`lib/post-game.ts`): um item por jogo com as duas
 * perguntas, uma resposta numa transação e "Não fui" sem "Voltaria?".
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

integrationTest('pós-jogo: fila, resposta única e desfazer', async () => {
  const seeded = await seedBar('starter', 'active', null)
  const { db, appRouter } = await load()
  const api = appRouter.createCaller(contextFor(seeded.fanId, 'fan')).postGame
  const ended = (hoursAgo: number) =>
    seeded.seedGame({ startsAt: new Date(Date.now() - hoursAgo * HOUR) })
  const reportOf = (eventId: string) =>
    db
      .select({ attended: attendanceReport.attended })
      .from(attendanceReport)
      .where(
        and(
          eq(attendanceReport.userId, seeded.fanId),
          eq(attendanceReport.eventId, eventId)
        )
      )
  const ratingOf = (eventId: string) =>
    db
      .select({
        wouldReturn: barRating.wouldReturn,
        reasons: barRating.reasons
      })
      .from(barRating)
      .where(
        and(
          eq(barRating.actorUserId, seeded.fanId),
          eq(barRating.eventId, eventId)
        )
      )
  try {
    const went = await ended(6)
    const missed = await ended(30)
    const directions = await ended(54)
    await db.insert(attendance).values(
      [went, missed].map((eventId) => ({
        userId: seeded.fanId,
        eventId
      }))
    )
    // Só abriu a rota: tem "Voltaria?", não tem "Você foi?".
    await db.execute(sql`
      INSERT INTO bar_commercial_event
        (id, bar_id, actor_user_id, type, source_event_id, occurred_at, commercial_day)
      VALUES (${crypto.randomUUID()}, ${seeded.barId}, ${seeded.fanId},
        'directions_opened', ${directions}, NOW(), CURRENT_DATE)
    `)

    expect(
      (await api.pending()).map((item) => [
        item.eventId,
        item.presence,
        item.rating
      ])
    ).toEqual([
      [went, { offer: null }, true],
      [missed, { offer: null }, true],
      [directions, null, true]
    ])

    // Uma resposta grava as duas.
    await api.answer({
      eventId: went,
      attended: true,
      rating: { wouldReturn: true, reasons: ['sound'] }
    })
    expect(await reportOf(went)).toEqual([{ attended: true }])
    expect(await ratingOf(went)).toEqual([
      { wouldReturn: true, reasons: ['sound'] }
    ])

    // "Não fui" com nota é recusado inteiro: nem a presença grava.
    expect(
      (
        await refusal(
          api.answer({
            eventId: missed,
            attended: false,
            rating: { wouldReturn: false, reasons: [] }
          })
        )
      ).code
    ).toBe('FORBIDDEN')
    expect(await reportOf(missed)).toEqual([])
    // Só "Não fui": a fila não pergunta mais "Voltaria?" desse jogo.
    await api.answer({ eventId: missed, attended: false })
    expect((await api.pending()).map((item) => item.eventId)).toEqual([
      directions
    ])
    // Nem pelo adaptador antigo.
    const ratings = appRouter.createCaller(
      contextFor(seeded.fanId, 'fan')
    ).ratings
    expect(
      (
        await refusal(
          ratings.submit({
            barId: seeded.barId,
            eventId: missed,
            wouldReturn: true
          })
        )
      ).code
    ).toBe('FORBIDDEN')

    // Desfazer a presença devolve só ela à fila.
    await api.undo({ eventId: went, presence: true })
    expect((await api.pending())[0]).toMatchObject({
      eventId: went,
      presence: { offer: null },
      rating: false
    })
    await api.undo({ eventId: went, rating: true })
    expect(await ratingOf(went)).toEqual([])
  } finally {
    await seeded.cleanup()
  }
})
