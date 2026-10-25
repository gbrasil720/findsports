import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { barCommercialEvent } from '@findsports_oficial/db/schema/analytics'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { getMonthNumbers } from '../lib/commercial-analytics/queries'
import { inAMonth, seedBar, withClock } from './integration-seed'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const at = (iso: string) => new Date(iso)

// O mês vira em Brasília, não em UTC: às 22:00 de 31/10 em Brasília já é
// 01/11 em UTC, e o número ainda é de outubro.
const OUTUBRO = at('2026-11-01T01:00:00Z') // 31/10 22:00 em Brasília
const NOVEMBRO = at('2026-11-01T03:30:00Z') // 01/11 00:30 em Brasília

integrationTest(
  'WEB-446: o mês de Plano e cobrança vira à meia-noite de Brasília',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const { db, barId, fanId } = ctx
    const otherFanId = crypto.randomUUID()
    await db.insert(user).values({
      id: otherFanId,
      name: 'Outro torcedor',
      email: `${otherFanId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true
    })

    try {
      // 30/09 22:00 em Brasília (01/10 em UTC): setembro.
      const setembro = await ctx.seedGame({
        startsAt: at('2026-10-01T01:00:00Z')
      })
      const meioDeOutubro = await ctx.seedGame({
        startsAt: at('2026-10-15T22:00:00Z')
      })
      // 31/10 21:00 em Brasília (01/11 em UTC): outubro.
      const fimDeOutubro = await ctx.seedGame({
        startsAt: at('2026-11-01T00:00:00Z')
      })
      const novembro = await ctx.seedGame({
        startsAt: at('2026-11-01T18:00:00Z')
      })

      await db.insert(attendance).values([
        { userId: fanId, eventId: setembro },
        { userId: fanId, eventId: fimDeOutubro },
        { userId: otherFanId, eventId: fimDeOutubro },
        { userId: fanId, eventId: novembro }
      ])

      const codeFor = async (eventId: string, partySize: number) => {
        const [row] = await db
          .insert(reservation)
          .values({ eventId, userId: fanId, partySize, status: 'confirmed' })
          .returning({ id: reservation.id })
        if (!row) throw new Error('reserva não criada')
        const [code] = await db
          .insert(reservationCode)
          .values({
            code: crypto
              .randomUUID()
              .replaceAll('-', '')
              .slice(0, 8)
              .toUpperCase(),
            reservationId: row.id,
            maxUses: partySize
          })
          .returning({ id: reservationCode.id })
        if (!code) throw new Error('código não criado')
        return code.id
      }
      const codeSetembro = await codeFor(setembro, 1)
      const codeOutubro = await codeFor(fimDeOutubro, 4)
      const codeNovembro = await codeFor(novembro, 1)

      await db.insert(reservationCodeUse).values([
        // Lançado pela comanda em outubro, de jogo de setembro: setembro.
        {
          codeId: codeSetembro,
          usedAt: at('2026-10-01T15:00:00Z'),
          late: true
        },
        // No balcão, 31/10 21:30 em Brasília: outubro.
        { codeId: codeOutubro, usedAt: at('2026-11-01T00:30:00Z') },
        // Lançado em novembro, de jogo de outubro: outubro.
        {
          codeId: codeOutubro,
          usedAt: at('2026-11-02T12:00:00Z'),
          late: true
        },
        // Desfeito não conta.
        {
          codeId: codeOutubro,
          usedAt: at('2026-11-01T00:40:00Z'),
          undoneAt: at('2026-11-01T00:41:00Z')
        },
        { codeId: codeNovembro, usedAt: at('2026-11-01T18:30:00Z') }
      ])

      const exposure = (
        actorUserId: string,
        sourceEventId: string,
        occurredAt: Date,
        type: 'classic_exposure' | 'classic_click' = 'classic_exposure'
      ) => ({
        barId,
        actorUserId,
        type,
        sourceEventId,
        occurredAt,
        commercialDay: occurredAt
          .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
          .slice(0, 10)
      })
      await db
        .insert(barCommercialEvent)
        .values([
          exposure(fanId, setembro, at('2026-10-01T00:30:00Z')),
          exposure(fanId, meioDeOutubro, at('2026-10-15T20:00:00Z')),
          exposure(fanId, fimDeOutubro, at('2026-11-01T00:10:00Z')),
          exposure(otherFanId, fimDeOutubro, at('2026-11-01T00:20:00Z')),
          exposure(
            fanId,
            fimDeOutubro,
            at('2026-11-01T00:15:00Z'),
            'classic_click'
          ),
          exposure(fanId, novembro, at('2026-11-01T10:00:00Z'))
        ])

      // A sessão do banco e o processo em outro fuso não mudam a resposta.
      for (const zones of [
        { session: 'UTC' },
        { session: 'Asia/Tokyo', process: 'Pacific/Honolulu' }
      ]) {
        await withClock(zones, async () => {
          expect(await getMonthNumbers(barId, OUTUBRO)).toEqual({
            going: 2,
            validatedCodes: 2,
            classicsOnTop: 2,
            profileViews: 0
          })
          expect(await getMonthNumbers(barId, NOVEMBRO)).toEqual({
            going: 1,
            validatedCodes: 1,
            classicsOnTop: 1,
            profileViews: 0
          })
        })
      }
    } finally {
      await db.delete(user).where(eq(user.id, otherFanId))
      await ctx.cleanup()
    }
  }
)

integrationTest('WEB-446: o que o plano não libera vem nulo', async () => {
  const elite = await seedBar('elite', 'active', inAMonth())
  const pro = await seedBar('pro', 'active', inAMonth())
  try {
    const numbers = await elite.owner.commercialAnalytics.getMyMonthNumbers()
    expect(numbers).toEqual({
      going: expect.any(Number),
      validatedCodes: expect.any(Number),
      classicsOnTop: expect.any(Number)
    })
    expect(await pro.owner.commercialAnalytics.getMyMonthNumbers()).toEqual({
      going: null,
      validatedCodes: null,
      classicsOnTop: null
    })
  } finally {
    await elite.cleanup()
    await pro.cleanup()
  }
})
