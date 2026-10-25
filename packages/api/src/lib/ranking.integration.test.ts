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
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from '../routers/integration-seed'

/**
 * Ranking do mês (WEB-409) contra o banco: o mês de Brasília, o empate, as
 * setas da semana, a privacidade dos amigos e a posição na cidade.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('ranking dos amigos e posição na cidade', async () => {
  const { db, appRouter } = await load()
  const { readCityPosition, readFriendsRanking } = await import(
    './ranking-read'
  )
  const tag = crypto.randomUUID().slice(0, 8)
  const city = `Cidade ${tag}`
  // Um bar por dono.
  const owners = [1, 2, 3, 4, 5].map(() => crypto.randomUUID())
  const ownerId = owners[0] as string
  const sportId = crypto.randomUUID()
  const people = ['Ana', 'Beto', 'Caio', 'Dora', 'Eva'].map((name) => ({
    id: crypto.randomUUID(),
    name: `${name} ${tag}`
  }))
  const [ana, beto, caio, dora, eva] = people as [
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0]
  ]
  await db.insert(user).values([
    ...owners.map((id) => ({
      id,
      name: 'Dono',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub' as const
    })),
    ...people.map((p) => ({
      id: p.id,
      name: p.name,
      email: `${p.id}@integration.invalid`,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true,
      searchCityName: city,
      searchCityUf: 'ZZ',
      activityVisibility:
        p === caio ? ('nobody' as const) : ('friends' as const)
    }))
  ])
  try {
    await db
      .insert(sport)
      .values({ id: sportId, name: sportId, slug: `ranking-${sportId}` })
    const bars = await db
      .insert(bar)
      .values(
        owners.map((id, i) => ({
          userId: id,
          name: `Bar ${i + 1} ${tag}`,
          address: 'Rua descartável, 1',
          neighborhood: `Bairro ${i + 1}`,
          city,
          latitude: '-23.55052000',
          longitude: '-46.63330800',
          isActive: true
        }))
      )
      .returning({ id: bar.id })
      .then((rows) => rows.map((row) => row.id))
    /** Código validado no balcão: `who` foi ao bar `n` no jogo de `iso`. */
    const went = async (who: { id: string }, n: number, iso: string) => {
      const [game] = await db
        .insert(event)
        .values({
          barId: bars[n - 1] as string,
          sportId,
          championship: 'Campeonato do ranking',
          startsAt: new Date(iso)
        })
        .returning({ id: event.id })
      const [booked] = await db
        .insert(reservation)
        .values({
          eventId: game?.id as string,
          userId: who.id,
          partySize: 1,
          status: 'confirmed'
        })
        .returning({ id: reservation.id })
      const [code] = await db
        .insert(reservationCode)
        .values({
          code: generateReservationCode(),
          reservationId: booked?.id as string,
          maxUses: 1
        })
        .returning({ id: reservationCode.id })
      await db
        .insert(reservationCodeUse)
        .values({ codeId: code?.id as string, usedAt: new Date(iso) })
    }
    // Amigos aceitos da Ana: Beto, Caio e Dora. Eva não.
    await db.insert(friendship).values(
      [beto, caio, dora].map((friend) => ({
        requesterId: ana.id,
        addresseeId: friend.id,
        via: 'search' as const,
        acceptedAt: new Date()
      }))
    )

    await went(ana, 1, '2026-10-02T22:00:00Z')
    await went(ana, 2, '2026-10-19T22:00:00Z')
    await went(beto, 1, '2026-10-03T22:00:00Z')
    await went(beto, 3, '2026-10-05T22:00:00Z')
    // 20h e 23h de 30/09 em Brasília: setembro, mesmo já outubro em UTC.
    await went(dora, 4, '2026-09-30T23:00:00Z')
    await went(dora, 5, '2026-10-01T02:00:00Z')
    await went(dora, 2, '2026-10-16T22:00:00Z')
    await went(dora, 3, '2026-10-18T22:00:00Z')
    for (const n of [1, 2, 3, 4, 5]) await went(caio, n, '2026-10-10T22:00:00Z')
    await went(eva, 1, '2026-10-11T22:00:00Z')

    const now = new Date('2026-10-20T15:00:00Z')
    const october = await readFriendsRanking(ana.id, 'bars', now)
    expect(october.month).toBe('2026-10')
    expect(october.closesInDays).toBe(11)
    // Os três com 2 bares: empate para quem chegou antes ao segundo. Caio
    // ("Ninguém") e Eva (não é amiga) não entram.
    expect(
      october.rows.map((r) => [r.position, r.name, r.value, r.move, r.me])
    ).toEqual([
      [1, beto.name, 2, 0, false],
      [2, dora.name, 2, 1, false],
      [3, ana.name, 2, -1, true]
    ])
    expect(october.chase).toEqual({ name: dora.name, need: 1, mine: 2 })

    // O mês vira à 0h de Brasília, todos voltam a zero e sem setas.
    const lastMinute = await readFriendsRanking(
      ana.id,
      'bars',
      new Date('2026-11-01T02:59:00Z')
    )
    expect(lastMinute.month).toBe('2026-10')
    expect(lastMinute.closesInDays).toBe(0)
    const november = await readFriendsRanking(
      ana.id,
      'bars',
      new Date('2026-11-01T03:00:00Z')
    )
    expect(november.month).toBe('2026-11')
    expect(november.rows.map((r) => [r.name, r.value, r.move])).toEqual([
      [ana.name, 0, null],
      [beto.name, 0, null],
      [dora.name, 0, null]
    ])

    // Caio passa a deixar os amigos verem: entra, e em primeiro.
    await db
      .update(user)
      .set({ activityVisibility: 'friends' })
      .where(eq(user.id, caio.id))
    const withCaio = await readFriendsRanking(ana.id, 'bars', now)
    expect(withCaio.rows[0]?.name).toBe(caio.name)
    expect(withCaio.rows[0]?.value).toBe(5)

    // Na cidade (todo mundo do perfil, privacidade à parte: só o número):
    // Caio 5, Beto e Dora 2 antes da Ana, Eva 1.
    expect(await readCityPosition(ana.id, now)).toEqual({
      city,
      position: 4,
      total: 5
    })
    expect((await readCityPosition(eva.id, now))?.position).toBe(5)

    // Pela API, com o relógio de verdade: só torcedor.
    const caller = appRouter.createCaller(contextFor(ana.id, 'fan'))
    const live = await caller.ranking.friends({ metric: 'games' })
    expect(live.rows.map((r) => r.id).sort()).toEqual(
      [ana.id, beto.id, caio.id, dora.id].sort()
    )
    const asPub = appRouter.createCaller(contextFor(ownerId, 'pub'))
    await expect(asPub.ranking.friends({ metric: 'bars' })).rejects.toThrow()
  } finally {
    await db
      .delete(user)
      .where(inArray(user.id, [...owners, ...people.map((p) => p.id)]))
    await db.delete(sport).where(eq(sport.id, sportId))
  }
})
