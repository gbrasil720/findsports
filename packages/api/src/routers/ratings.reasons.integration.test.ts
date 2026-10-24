import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { RATING_PUBLIC_FLOOR } from '../lib/rating'
import { contextFor, load, seedBar } from './integration-seed'

/**
 * "O que pesou?" (WEB-398): as etiquetas vão junto do "voltaria" em
 * `ratings.submit`, reenviar troca as duas, e a página do bar só mostra o
 * resumo (a favor e contra) quando a nota é pública, pelo mesmo piso.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'etiquetas gravadas com o voltaria e resumo só a partir do piso',
  async () => {
    const [{ appRouter }, { setAppConfig, resetAppConfig }] = await Promise.all(
      [load(), import('../lib/app-config')]
    )
    const seeded = await seedBar('starter', 'active', null)
    const { db } = seeded
    const fans = Array.from({ length: RATING_PUBLIC_FLOOR }, () =>
      crypto.randomUUID()
    )
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
    try {
      await setAppConfig('rating.public_display', true, null)
      // Jogo que já acabou, com todos marcando "Vou assistir aqui".
      const eventId = await seeded.seedGame({
        startsAt: new Date(Date.now() - 6 * 3_600_000)
      })
      await db
        .insert(attendance)
        .values([seeded.fanId, ...fans].map((userId) => ({ userId, eventId })))
      const callers = fans.map((id) =>
        appRouter.createCaller(contextFor(id, 'fan'))
      )
      const rate = (
        index: number,
        wouldReturn: boolean,
        reasons?: (
          | 'sound'
          | 'screen'
          | 'service'
          | 'price'
          | 'crowded'
          | 'food'
        )[]
      ) =>
        callers[index]?.ratings.submit({
          barId: seeded.barId,
          eventId,
          wouldReturn,
          reasons
        })

      await rate(0, true, ['screen', 'sound', 'screen'])
      const stored = async (userId: string) => {
        const [row] = await db
          .select({ reasons: barRating.reasons })
          .from(barRating)
          .where(
            and(
              eq(barRating.eventId, eventId),
              eq(barRating.actorUserId, userId)
            )
          )
        return row?.reasons
      }
      // Repetida sai, e a ordem é a da tela.
      expect(await stored(fans[0] as string)).toEqual(['sound', 'screen'])

      // Etiqueta fora do vocabulário é recusada.
      await expect(
        callers[1]?.ratings.submit({
          barId: seeded.barId,
          eventId,
          wouldReturn: true,
          reasons: ['clima' as 'food']
        })
      ).rejects.toThrow()

      // Abaixo do piso: nem nota, nem resumo.
      await rate(1, false, ['crowded'])
      const below = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(below.rating).toBeNull()
      expect(below.ratingReasons).toBeNull()

      // Sem etiqueta também vale; no piso o resumo aparece separado.
      await rate(2, true)
      const public_ = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(public_.rating?.total).toBe(RATING_PUBLIC_FLOOR)
      expect(public_.ratingReasons).toEqual({
        positive: ['sound', 'screen'],
        negative: ['crowded']
      })

      // Reenviar troca a resposta e as etiquetas.
      await rate(1, true, ['food'])
      const changed = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(changed.ratingReasons).toEqual({
        positive: ['sound', 'screen', 'food'],
        negative: []
      })

      // O dono vê as etiquetas de cada resposta, abaixo do piso também, sem
      // saber quem marcou ("Meu espaço").
      const doDono = await seeded.owner.pub.getMyRatings()
      expect(doDono.recent.map((item) => item.reasons).sort()).toEqual([
        [],
        ['food'],
        ['sound', 'screen']
      ])

      // Com a exibição da nota desligada, o resumo some junto.
      await setAppConfig('rating.public_display', false, null)
      const hidden = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(hidden.ratingReasons).toBeNull()
    } finally {
      await resetAppConfig('rating.public_display')
      await db.delete(user).where(inArray(user.id, fans))
      await seeded.cleanup()
    }
  }
)
