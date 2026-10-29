import { expect, test } from 'bun:test'
import { and, eq, inArray, sql } from '@findsports_oficial/db'
import { getEventEnd } from '@findsports_oficial/db/event-window'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import {
  attendance,
  attendanceCheckin
} from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { bar } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * WEB-408 e WEB-451 contra o banco de verdade:
 *
 * - o check-in "Estou aqui" recusa longe do bar e fora da janela do jogo, e
 *   repetido não duplica;
 * - só a avaliação verificada (check-in ou código validado e não desfeito)
 *   entra nos contadores do bar, e a prova que chega depois da avaliação
 *   (ou o código desfeito) refaz a conta;
 * - estrelas somam na média pública, com o piso;
 * - o comentário passa pela revisão do Houdini, o nome só aparece para quem
 *   escolheu, e o recusado não aparece em lugar nenhum.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000
// O bar do `seedBar`, e dois pontos ao norte: ~100 m e ~1 km.
const BAR = { latitude: -23.55052, longitude: -46.633308 }
const near = { latitude: BAR.latitude + 0.0009, longitude: BAR.longitude }
const far = { latitude: BAR.latitude + 0.009, longitude: BAR.longitude }

integrationTest(
  'check-in, nota só com verificadas, estrelas e revisão do comentário',
  async () => {
    const [{ appRouter }, { setAppConfig, resetAppConfig }, { checkIn }] =
      await Promise.all([
        load(),
        import('../lib/app-config'),
        import('../lib/check-in')
      ])
    const seeded = await seedBar('elite', 'active', null)
    const { db } = seeded
    const [b, c, d, e] = Array.from({ length: 4 }, () => crypto.randomUUID())
    const others = [b, c, d, e] as string[]
    await db.insert(user).values(
      others.map((id, index) => ({
        id,
        name: `Torcedor ${'BCDE'[index]}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      }))
    )
    const a = seeded.fanId
    const fan = (id: string) => appRouter.createCaller(contextFor(id, 'fan'))
    const admin = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )
    try {
      await setAppConfig('rating.public_display', true, null)

      // --- check-in -----------------------------------------------------

      const live = await seeded.seedGame({
        startsAt: new Date(Date.now() - 0.5 * HOUR)
      })
      const later = await seeded.seedGame()
      const checkInAt = (id: string, eventId: string, at = near) =>
        fan(id).attendance.checkIn({ eventId, ...at })

      const tooFar = await refusal(checkInAt(a, live, far))
      expect(tooFar.code).toBe('PRECONDITION_FAILED')
      expect(tooFar.message).toBe(
        'Você está a 1 km do bar. Chegue a até 150 m para fazer o check-in.'
      )
      expect((await refusal(checkInAt(a, later))).message).toBe(
        'O check-in abre 3 h antes do jogo.'
      )
      await checkInAt(a, live)
      // Repetido não é erro, e não vira segunda linha.
      await checkInAt(a, live)
      const rows = await db
        .select()
        .from(attendanceCheckin)
        .where(eq(attendanceCheckin.eventId, live))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.distanceM).toBeGreaterThan(90)
      expect(rows[0]?.distanceM).toBeLessThan(110)
      // A página do bar oferece o check-in do jogo ao vivo, já feito.
      expect((await fan(a).pubs.getById({ id: seeded.barId })).checkIn).toEqual(
        { eventId: live, done: true }
      )
      expect(
        (await fan(b as string).pubs.getById({ id: seeded.barId })).checkIn
      ).toEqual({ eventId: live, done: false })

      // --- avaliação de um jogo que acabou ------------------------------

      const startsAt = new Date(Date.now() - 6 * HOUR)
      const past = await seeded.seedGame({ startsAt })
      const end = getEventEnd({ startsAt, endsAt: null })
      // A janela fecha 3 h depois do fim; o check-in foi durante o jogo.
      expect(
        (
          await refusal(
            checkIn(
              a,
              { eventId: past, ...near },
              new Date(end.getTime() + 3.5 * HOUR)
            )
          )
        ).message
      ).toBe('O check-in deste jogo já fechou.')
      const during = new Date(startsAt.getTime() + HOUR)
      for (const id of [a, c, d] as string[]) {
        await checkIn(id, { eventId: past, ...BAR }, during)
      }
      await db
        .insert(attendance)
        .values([a, ...others].map((userId) => ({ userId, eventId: past })))

      const answer = (
        id: string,
        rating: {
          wouldReturn: boolean
          stars: number
          comment?: string
          identified?: boolean
        }
      ) =>
        fan(id).postGame.answer({
          eventId: past,
          rating: { reasons: [], ...rating }
        })
      await answer(a, {
        wouldReturn: true,
        stars: 5,
        comment: '  Som alto e telão enorme.  ',
        identified: true
      })
      // B não fez check-in: gravada, fora da nota.
      await answer(b as string, {
        wouldReturn: false,
        stars: 1,
        comment: 'Péssimo.'
      })
      await answer(c as string, { wouldReturn: true, stars: 4 })
      await answer(d as string, { wouldReturn: false, stars: 4 })
      // Estrela fora de 1 a 5 é recusada.
      await expect(
        answer(e as string, { wouldReturn: true, stars: 6 })
      ).rejects.toThrow()

      const counters = async () => {
        const [row] = await db
          .select({
            count: bar.ratingCount,
            positive: bar.ratingPositive,
            starsCount: bar.ratingStarsCount,
            starsSum: bar.ratingStarsSum
          })
          .from(bar)
          .where(eq(bar.id, seeded.barId))
        return row
      }
      expect(await counters()).toEqual({
        count: 3,
        positive: 2,
        starsCount: 3,
        starsSum: 13
      })

      // Nota pública: 2 de 3 voltariam, 13/3 estrelas; o comentário de A
      // ainda está em revisão, então nada em "O que dizem".
      const before = await fan(e as string).pubs.getById({ id: seeded.barId })
      expect(before.rating).toEqual({
        positive: 2,
        total: 3,
        percentage: 67,
        stars: 4.3
      })
      expect(before.reviews).toEqual([])

      // --- revisão do comentário ----------------------------------------

      const queue = await admin.adminReview.queue()
      const mine = queue.comments.filter((item) => item.barId === seeded.barId)
      expect(mine.map((item) => item.comment).sort()).toEqual([
        'Péssimo.',
        'Som alto e telão enorme.'
      ])
      const ofA = mine.find((item) => item.identified)
      const ofB = mine.find((item) => !item.identified)
      expect(ofB?.verified).toBe(false)
      await admin.adminReview.decideComment({
        ratingId: ofA?.ratingId as string,
        text: 'Som alto e telão enorme.',
        approve: true
      })
      await admin.adminReview.decideComment({
        ratingId: ofB?.ratingId as string,
        text: 'Péssimo.',
        approve: false,
        reason: 'Não fala do jogo no bar.'
      })
      // Já decidido: a fila recarrega.
      expect(
        (
          await refusal(
            admin.adminReview.decideComment({
              ratingId: ofB?.ratingId as string,
              text: 'Péssimo.',
              approve: true
            })
          )
        ).code
      ).toBe('CONFLICT')
      const grimorio = await db
        .select({ kind: adminAction.kind })
        .from(adminAction)
        .where(eq(adminAction.targetId, seeded.barId))
      expect(grimorio.map((row) => row.kind).sort()).toEqual([
        'bar.rating_comment_approve',
        'bar.rating_comment_reject'
      ])

      const after = await fan(e as string).pubs.getById({ id: seeded.barId })
      expect(after.reviews).toHaveLength(1)
      expect(after.reviews[0]).toMatchObject({
        name: 'Torcedor de integração',
        comment: 'Som alto e telão enorme.',
        stars: 5,
        wouldReturn: true
      })

      // O dono vê todas, com a marca de verificada; nome só de quem quis,
      // comentário só o aprovado.
      const owner = await seeded.owner.pub.getMyRatings()
      expect(owner).toMatchObject({
        total: 3,
        unverified: 1,
        stars: 4.3,
        percentage: 67
      })
      expect(owner.recent).toHaveLength(4)
      const ofBForOwner = owner.recent.find((item) => !item.verified)
      expect(ofBForOwner).toMatchObject({ name: null, comment: null, stars: 1 })
      expect(
        owner.recent.filter((item) => item.name !== null).map((i) => i.name)
      ).toEqual(['Torcedor de integração'])

      // Reenviar o mesmo texto guarda a aprovação; trocar volta à revisão.
      await answer(a, {
        wouldReturn: true,
        stars: 5,
        comment: 'Som alto e telão enorme.',
        identified: true
      })
      expect(
        (await fan(e as string).pubs.getById({ id: seeded.barId })).reviews
      ).toHaveLength(1)
      await answer(a, {
        wouldReturn: true,
        stars: 5,
        comment: 'Mudei de ideia sobre o som.',
        identified: true
      })
      expect(
        (await fan(e as string).pubs.getById({ id: seeded.barId })).reviews
      ).toEqual([])

      // --- prova que chega depois ---------------------------------------

      // B faz check-in (ainda na janela): a avaliação dele passa a contar.
      await checkIn(b as string, { eventId: past, ...BAR }, during)
      expect(await counters()).toEqual({
        count: 4,
        positive: 2,
        starsCount: 4,
        starsSum: 14
      })

      // E avalia sem prova; o código validado depois a verifica, e
      // desfazer a validação a tira de novo.
      await answer(e as string, { wouldReturn: true, stars: 3 })
      expect((await counters())?.count).toBe(4)
      const [created] = await db
        .insert(reservation)
        .values({
          eventId: past,
          userId: e as string,
          partySize: 1,
          status: 'confirmed'
        })
        .returning({ id: reservation.id })
      const [code] = await db
        .insert(reservationCode)
        .values({
          code: generateReservationCode(),
          reservationId: created?.id as string,
          maxUses: 1
        })
        .returning({ id: reservationCode.id })
      const [use] = await db
        .insert(reservationCodeUse)
        .values({ codeId: code?.id as string })
        .returning({ id: reservationCodeUse.id })
      expect(await counters()).toEqual({
        count: 5,
        positive: 3,
        starsCount: 5,
        starsSum: 17
      })
      await db
        .update(reservationCodeUse)
        .set({ undoneAt: new Date(Date.now() + 1000) })
        .where(eq(reservationCodeUse.id, use?.id as string))
      expect((await counters())?.count).toBe(4)

      // A marca do banco é a mesma visita do TypeScript (`visits.ts`).
      const { visit } = await import('../lib/visits')
      const ratings = await db
        .select({ userId: barRating.actorUserId, verified: barRating.verified })
        .from(barRating)
        .where(eq(barRating.eventId, past))
      const visits = await db
        .select({ userId: visit.userId })
        .from(visit)
        .where(and(eq(visit.eventId, past)))
      const visited = new Set(visits.map((row) => row.userId))
      for (const row of ratings) {
        expect(row.verified).toBe(visited.has(row.userId))
      }

      // `verified` é do banco: gravar à mão não muda nada.
      await db
        .update(barRating)
        .set({ verified: true })
        .where(eq(barRating.actorUserId, e as string))
      expect((await counters())?.count).toBe(4)
      expect(
        await db.execute(
          sql`SELECT verified FROM bar_rating WHERE actor_user_id = ${e}`
        )
      ).toMatchObject({ rows: [{ verified: false }] })
    } finally {
      await resetAppConfig('rating.public_display')
      await db.delete(user).where(inArray(user.id, others))
      await seeded.cleanup()
    }
  }
)
