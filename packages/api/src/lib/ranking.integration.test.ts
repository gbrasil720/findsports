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
  const { readCityBoard, readFriendsRanking } = await import('./ranking-read')
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

    // Na cidade (27a–27c, WEB-465): o ranking global nasce desligado, e
    // quem está fora não vê nem a própria posição.
    expect(await readCityBoard(ana.id, 'bars', 0, now)).toEqual({
      listed: false,
      city,
      rankingGlobal: false,
      nobody: false
    })
    for (const p of people)
      await appRouter
        .createCaller(contextFor(p.id, 'fan'))
        .friends.updatePrivacy({ rankingGlobal: true })
    // Ligar dá o `@` que a lista mostra.
    const [named] = await db
      .select({ username: user.username, on: user.rankingGlobal })
      .from(user)
      .where(eq(user.id, ana.id))
    expect(named?.on).toBe(true)
    expect(named?.username).toBeTruthy()
    // Eva liga, mas escolhe "Ninguém" em "Onde você foi": fica de fora.
    await db
      .update(user)
      .set({ activityVisibility: 'nobody' })
      .where(eq(user.id, eva.id))
    expect(await readCityBoard(eva.id, 'bars', 0, now)).toMatchObject({
      listed: false,
      rankingGlobal: true,
      nobody: true
    })
    // Caio 5, Beto e Dora 2 antes da Ana (chegaram antes ao segundo bar).
    const board = await readCityBoard(ana.id, 'bars', 0, now)
    if (!board?.listed) throw new Error('Ana devia estar na lista')
    expect(board.total).toBe(4)
    expect(board.position).toBe(4)
    expect(board.nextCursor).toBeNull()
    expect(board.rows.map((r) => [r.position, r.name, r.value, r.me])).toEqual([
      [1, caio.name, 5, false],
      [2, beto.name, 2, false],
      [3, dora.name, 2, false],
      [4, ana.name, 2, true]
    ])
    expect(board.rows[0]?.username).toBeTruthy()
    expect(board.around.map((r) => r.position)).toEqual([2, 3, 4])
    // Uma semana atrás a Ana era 3ª (1 bar; Dora ainda sem nenhum em
    // outubro): caiu uma posição.
    expect(board.weekMove).toBe(-1)
    // A página seguinte não refaz a conta da semana.
    expect(await readCityBoard(ana.id, 'bars', 4, now)).toMatchObject({
      listed: true,
      weekMove: null
    })
    // Jogos: um por jogo validado; Dora tem dois em outubro, como a Ana.
    const games = await readCityBoard(ana.id, 'games', 0, now)
    if (!games?.listed) throw new Error('Ana devia estar na lista')
    expect(games.rows.map((r) => [r.name, r.value])).toEqual([
      [caio.name, 5],
      [beto.name, 2],
      [dora.name, 2],
      [ana.name, 2]
    ])
    // Desligar tira da lista dos outros também.
    await appRouter
      .createCaller(contextFor(caio.id, 'fan'))
      .friends.updatePrivacy({ rankingGlobal: false })
    const withoutCaio = await readCityBoard(beto.id, 'bars', 0, now)
    if (!withoutCaio?.listed) throw new Error('Beto devia estar na lista')
    expect(withoutCaio.rows.map((r) => r.name)).toEqual([
      beto.name,
      dora.name,
      ana.name
    ])

    // Pela API, com o relógio de verdade: só torcedor.
    const caller = appRouter.createCaller(contextFor(ana.id, 'fan'))
    const live = await caller.ranking.friends({ metric: 'games' })
    expect(live.rows.map((r) => r.id).sort()).toEqual(
      [ana.id, beto.id, caio.id, dora.id].sort()
    )
    const asPub = appRouter.createCaller(contextFor(ownerId, 'pub'))
    await expect(asPub.ranking.friends({ metric: 'bars' })).rejects.toThrow()
    await expect(asPub.ranking.city({})).rejects.toThrow()
    expect((await caller.ranking.city({ metric: 'games' }))?.listed).toBe(true)
  } finally {
    await db
      .delete(user)
      .where(inArray(user.id, [...owners, ...people.map((p) => p.id)]))
    await db.delete(sport).where(eq(sport.id, sportId))
  }
})

integrationTest(
  'ranking da cidade com 5 mil torcedores: páginas por posição e tempo',
  async () => {
    const { db } = await load()
    const { sql } = await import('@findsports_oficial/db')
    const { readCityBoard } = await import('./ranking-read')
    const tag = crypto.randomUUID().slice(0, 8)
    const city = `Massa ${tag}`
    // Um bar por dono.
    const owners = [1, 2, 3, 4, 5].map(() => crypto.randomUUID())
    const sportId = crypto.randomUUID()
    const fans = 5000
    await db.insert(user).values(
      owners.map((id) => ({
        id,
        name: 'Dono',
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const
      }))
    )
    try {
      await db
        .insert(sport)
        .values({ id: sportId, name: sportId, slug: `massa-${sportId}` })
      await db.insert(bar).values(
        owners.map((id, n) => ({
          userId: id,
          name: `Bar ${n + 1} ${tag}`,
          address: 'Rua descartável, 1',
          neighborhood: `Bairro ${n + 1}`,
          city,
          latitude: '-23.55052000',
          longitude: '-46.63330800',
          isActive: true
        }))
      )
      // A carga entra em lotes de 27 mil linhas, e cada linha passa pelos
      // gatilhos e pelas FKs (`reservation_code_guard`, `used_count`, a
      // reverificação da avaliação), que buscam por id em `user`,
      // `reservation` e `reservation_code`. A conexão do pool guarda o plano
      // genérico dessas buscas: se o autovacuum analisou as tabelas quase
      // vazias e a conexão já rodou os gatilhos (o teste de cima, ou outro
      // arquivo), o plano guardado é varredura sequencial, e cada linha varre
      // a tabela inteira: 60 s só na carga no CI. `ANALYZE` depois de cada
      // lote invalida esses planos. Em produção a tabela não sai de vazia
      // para 27 mil linhas sem o autovacuum reanalisar no caminho.
      // 15 jogos em outubro, nos 5 bares; o torcedor n foi aos n % 12
      // primeiros. Todos ligaram o ranking global.
      await db.execute(sql`
        INSERT INTO "user" (id, name, email, email_verified, role,
          onboarding_completed, search_city_name, search_city_uf,
          ranking_global, activity_visibility)
        SELECT ${tag} || '-' || n, 'Torcedor ' || n,
          ${tag} || '-' || n || '@integration.invalid', true, 'fan', true,
          ${city}, 'ZZ', true, 'friends'
        FROM generate_series(1, ${fans}) n
      `)
      await db.execute(sql`ANALYZE "user"`)
      await db.execute(sql`
        INSERT INTO event (id, bar_id, sport_id, championship, starts_at)
        SELECT ${tag} || '-ev-' || e,
          (SELECT id FROM bar WHERE city = ${city} ORDER BY name OFFSET e % 5 LIMIT 1),
          ${sportId}, 'Massa', timestamp '2026-10-01 22:00' + e * interval '1 day'
        FROM generate_series(1, 15) e
      `)
      await db.execute(sql`
        INSERT INTO reservation (id, event_id, user_id, party_size, status)
        SELECT ${tag} || '-r-' || n || '-' || e, ${tag} || '-ev-' || e,
          ${tag} || '-' || n, 1, 'confirmed'
        FROM generate_series(1, ${fans}) n, generate_series(1, 15) e
        WHERE e <= n % 12
      `)
      await db.execute(sql`ANALYZE reservation`)
      await db.execute(sql`
        INSERT INTO reservation_code (id, code, reservation_id, max_uses)
        SELECT id, upper(left(md5(id), 10)), id, 1 FROM reservation
        WHERE id LIKE ${`${tag}-r-%`}
      `)
      await db.execute(sql`ANALYZE reservation_code`)
      await db.execute(sql`
        INSERT INTO reservation_code_use (id, code_id, used_at)
        SELECT c.id, c.id, e.starts_at + interval '20 minutes'
        FROM reservation_code c
        JOIN reservation r ON r.id = c.reservation_id
        JOIN event e ON e.id = r.event_id
        WHERE c.id LIKE ${`${tag}-r-%`}
      `)
      // Estatísticas em dia para a leitura, como em produção (e para a
      // limpeza, que apaga em cascata pelas mesmas buscas).
      await db.execute(sql`ANALYZE event, reservation_code_use`)
      const now = new Date('2026-10-20T15:00:00Z')
      const me = `${tag}-2500`
      const started = performance.now()
      const first = await readCityBoard(me, 'bars', 0, now)
      const ms = performance.now() - started
      console.info(
        `[ranking] cidade com ${fans} torcedores: ${ms.toFixed(0)} ms`
      )
      if (!first?.listed) throw new Error('devia estar na lista')
      expect(first.total).toBe(fans)
      expect(first.rows.map((r) => r.position)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8
      ])
      expect(first.nextCursor).toBe(8)
      const mine = first.position as number
      expect(first.around.map((r) => r.position)).toEqual([
        mine - 2,
        mine - 1,
        mine,
        mine + 1,
        mine + 2
      ])
      expect(first.around[2]?.me).toBe(true)
      // A próxima página continua de onde a primeira parou, sem buraco.
      const second = await readCityBoard(me, 'bars', 8, now)
      if (!second?.listed) throw new Error('devia estar na lista')
      expect(second.rows.map((r) => r.position)).toEqual(
        Array.from({ length: 30 }, (_, i) => 9 + i)
      )
      expect(second.position).toBe(mine)
      // Mais alto primeiro: 5 bares é o máximo.
      expect(first.rows[0]?.value).toBe(5)
      expect(ms).toBeLessThan(3000)
    } finally {
      await db.execute(sql`DELETE FROM "user" WHERE id LIKE ${`${tag}-%`}`)
      await db.delete(user).where(inArray(user.id, owners))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  },
  60_000
)
