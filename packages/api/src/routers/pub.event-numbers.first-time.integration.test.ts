import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import { attendanceCheckin } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

// "Primeira vez no bar" na faixa do jogo publicado (WEB-530): de quem chegou
// com código neste jogo, quem não tinha visita (`visits.ts`) a este bar antes.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000)

integrationTest(
  'conta quem chegou com código sem visita anterior ao bar, só no Elite e com o jogo começado',
  async () => {
    const meu = await seedBar('elite', 'active', inHours(500))
    const outroBar = await seedBar('elite', 'active', inHours(500))
    const pro = await seedBar('pro', 'active', inHours(500))
    const fans = Array.from({ length: 6 }, () => crypto.randomUUID())
    const [novo, voltou, desfeitoAntes, checkin, deOutroBar, desfeitoAgora] =
      fans as [string, string, string, string, string, string]
    const { db } = meu
    await db.insert(user).values(
      fans.map((id) => ({
        id,
        name: `Torcedor ${id.slice(0, 4)}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const
      }))
    )

    /** Código do torcedor no jogo, validado em `usedAt`; `undone` o desfaz. */
    const validated = async (
      eventId: string,
      userId: string,
      usedAt: Date,
      undone = false
    ) => {
      const [created] = await db
        .insert(reservation)
        .values({ eventId, userId, partySize: 1, status: 'confirmed' })
        .returning({ id: reservation.id })
      const [code] = await db
        .insert(reservationCode)
        .values({
          code: generateReservationCode(),
          reservationId: created?.id as string,
          maxUses: 1
        })
        .returning({ id: reservationCode.id })
      await db.insert(reservationCodeUse).values({
        codeId: code?.id as string,
        usedAt,
        undoneAt: undone ? new Date(usedAt.getTime() + 1000) : null
      })
    }

    try {
      const antes = await meu.seedGame({ startsAt: inHours(-24 * 7) })
      const aoVivo = await meu.seedGame({ startsAt: inHours(-1) })
      const amanha = await meu.seedGame({ startsAt: inHours(24) })
      const longe = await outroBar.seedGame({ startsAt: inHours(-24 * 3) })

      // O histórico: visita por código, código desfeito (não é visita),
      // check-in e visita a outro bar (não conta aqui).
      await validated(antes, voltou, inHours(-24 * 7 + 1))
      await validated(antes, desfeitoAntes, inHours(-24 * 7 + 1), true)
      await db.insert(attendanceCheckin).values({
        userId: checkin,
        eventId: antes,
        latitude: -23.55,
        longitude: -46.63,
        distanceM: 10
      })
      await validated(longe, deOutroBar, inHours(-24 * 3 + 1))

      // Neste jogo todos chegam com código; o último foi desfeito.
      for (const fan of [novo, voltou, desfeitoAntes, checkin, deOutroBar]) {
        await validated(aoVivo, fan, inHours(-0.5))
      }
      await validated(aoVivo, desfeitoAgora, inHours(-0.5), true)

      const numbers = await meu.owner.pub.getMyEventNumbers()
      const of = (id: string) => numbers.find((n) => n.eventId === id)
      // novo, desfeitoAntes e deOutroBar: nenhuma visita anterior a este bar.
      expect(of(aoVivo)?.firstTime).toBe(3)
      // O jogo da semana passada: todos que chegaram eram novos.
      expect(of(antes)?.firstTime).toBe(1)
      // Jogo que não começou: sem o número.
      expect(of(amanha)?.firstTime).toBeNull()

      // Fora do Elite: nulo, não zero.
      const proGame = await pro.seedGame({ startsAt: inHours(-1) })
      await validated(proGame, novo, inHours(-0.5))
      const proNumbers = await pro.owner.pub.getMyEventNumbers()
      expect(proNumbers.find((n) => n.eventId === proGame)?.firstTime).toBe(
        null
      )
    } finally {
      await db.delete(user).where(inArray(user.id, fans))
      for (const t of [meu, outroBar, pro]) await t.cleanup()
    }
  }
)
