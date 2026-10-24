import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Amigos (S1 do app): pedido, aceite, recusa, privacidade de quem recebe,
 * sugestões de amigos de amigos, busca, código, convite e contatos.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('amizade de ponta a ponta', async () => {
  const { db, appRouter } = await load()
  const tag = crypto.randomUUID().slice(0, 8)
  const people = ['ana', 'beto', 'caio', 'dora', 'eva'].map((key) => ({
    key,
    id: crypto.randomUUID(),
    name: `${key[0]?.toUpperCase()}${key.slice(1)} Teste${tag}`,
    email: `${key}-${tag}@integration.invalid`
  }))
  const [ana, beto, caio, dora, eva] = people as [
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0]
  ]
  await db.insert(user).values(
    people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true
    }))
  )
  const as = (p: { id: string }, now = new Date()) =>
    appRouter.createCaller(contextFor(p.id, 'fan', now)).friends
  try {
    // @ e código nascem no primeiro uso.
    const anaMe = await as(ana).me()
    expect(anaMe.username).toMatch(/^anateste/)
    // Iniciais do primeiro e do último pedaço do nome; o sufixo do teste muda o último.
    expect(anaMe.friendCode).toMatch(/^A[A-Z]-\d{4}$/)
    expect(anaMe.activityVisibility).toBe('friends')

    // Ana pede, Beto vê o pedido e aceita.
    expect((await as(ana).request({ userId: beto.id })).relation).toBe('sent')
    const betoView = await as(beto).overview()
    expect(betoView.requests.map((r) => r.id)).toEqual([ana.id])
    await as(beto).respond({ userId: ana.id, accept: true })
    expect((await as(ana).overview()).friends.map((f) => f.id)).toEqual([
      beto.id
    ])

    // Caio pede a Ana; Ana recusa e o pedido some.
    await as(caio).request({ userId: ana.id })
    await as(ana).respond({ userId: caio.id, accept: false })
    expect((await as(ana).overview()).requests).toEqual([])

    // Beto e Caio viram amigos: Caio é sugestão para Ana (1 em comum).
    await as(beto).request({ userId: caio.id })
    await as(caio).request({ userId: beto.id }) // aceita o que já veio
    const anaView = await as(ana).overview()
    expect(anaView.suggestions.map((s) => [s.id, s.mutual])).toEqual([
      [caio.id, 1]
    ])

    // "Quem pode te adicionar": Dora só aceita amigos de amigos.
    await db
      .update(user)
      .set({ friendRequestsFrom: 'friends_of_friends' })
      .where(eq(user.id, dora.id))
    await expect(as(ana).request({ userId: dora.id })).rejects.toThrow(
      'amigos de amigos'
    )

    // Busca por nome e por @, com a relação de cada um.
    const found = await as(ana).search({ query: `beto teste${tag}` })
    expect(found.map((f) => [f.id, f.relation])).toEqual([[beto.id, 'friends']])
    const betoMe = await as(beto).me()
    const byAt = await as(ana).search({ query: `@${betoMe.username}` })
    expect(byAt[0]?.id).toBe(beto.id)

    // Código: Eva acha a Ana pelo código.
    const byCode = await as(eva).byCode({
      code: anaMe.friendCode.toLowerCase()
    })
    expect(byCode?.id).toBe(ana.id)
    expect(byCode?.relation).toBe('none')

    // Convite: conta nova entra como amiga; conta antiga só manda pedido.
    expect(
      (await as(eva).joinByInvite({ code: anaMe.friendCode })).relation
    ).toBe('friends')
    const old = new Date(Date.now() - 5 * 86_400_000)
    expect(
      (await as(dora, old).joinByInvite({ code: anaMe.friendCode })).relation
    ).toBe('sent')

    // Contatos: só pelo hash do e-mail, e só quem aceita pedidos de todos.
    const hash = (email: string) =>
      createHash('sha256').update(email.toLowerCase()).digest('hex')
    const matched = await as(caio).matchContacts({
      hashes: [hash(ana.email), hash(dora.email.toUpperCase())]
    })
    expect(matched.map((m) => m.id)).toEqual([ana.id])

    // Perfil: Beto vê o mês da Ana; com "Ninguém", não vê mais.
    const profile = await as(beto).profile({ userId: ana.id })
    expect(profile.visible).toBe(true)
    expect(profile.month?.them.games).toBe(0)
    await as(ana).updatePrivacy({ activityVisibility: 'nobody' })
    expect((await as(beto).profile({ userId: ana.id })).visible).toBe(false)

    // @ ocupado e formato.
    await expect(
      as(ana).updateUsername({ username: betoMe.username })
    ).rejects.toThrow('outra pessoa')
    await expect(as(ana).updateUsername({ username: 'a b' })).rejects.toThrow(
      'de 3 a 20'
    )
    expect(
      (await as(ana).updateUsername({ username: `@Ana.${tag}` })).username
    ).toBe(`ana.${tag}`)

    // Desfazer.
    await as(ana).remove({ userId: beto.id })
    expect((await as(ana).overview()).friends.map((f) => f.id)).toEqual([
      eva.id
    ])
  } finally {
    await db.delete(user).where(
      inArray(
        user.id,
        people.map((p) => p.id)
      )
    )
  }
})

integrationTest(
  'avisos de amigos: pedido recebido e pedido aceito',
  async () => {
    const { db, appRouter } = await load()
    const tag = crypto.randomUUID().slice(0, 8)
    const people = ['lia', 'mar', 'nei', 'oto'].map((key) => ({
      id: crypto.randomUUID(),
      name: `${key.toUpperCase()} Aviso${tag}`,
      email: `${key}-${tag}@integration.invalid`,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true
    }))
    const [lia, mar, nei, oto] = people as [
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0]
    ]
    await db.insert(user).values(people)
    const as = (p: { id: string }) =>
      appRouter.createCaller(contextFor(p.id, 'fan')).friends
    try {
      // Lia e Mar são amigas; Nei é amigo de Mar e pede a Lia.
      await as(lia).request({ userId: mar.id })
      await as(mar).respond({ userId: lia.id, accept: true })
      await as(nei).request({ userId: mar.id })
      await as(mar).respond({ userId: nei.id, accept: true })
      await as(nei).request({ userId: lia.id })
      // Lia pede a Oto, que aceita.
      await as(lia).request({ userId: oto.id })
      await as(oto).respond({ userId: lia.id, accept: true })

      const notices = await as(lia).notices()
      expect(notices.requests.map((r) => [r.id, r.mutual])).toEqual([
        [nei.id, 1]
      ])
      expect(notices.requests[0]?.mutualInitials).toEqual(['MA'])
      // Mar e Oto aceitaram os pedidos de Lia; o mais recente primeiro.
      expect(notices.accepted.map((a) => a.id)).toEqual([oto.id, mar.id])
      // Quem aceitou o pedido de outra pessoa não recebe aviso de "aceito".
      expect((await as(mar).notices()).accepted.map((a) => a.id)).toEqual([])

      // Respondido, o pedido sai dos avisos; o aceite vira aviso de quem pediu.
      await as(lia).respond({ userId: nei.id, accept: true })
      expect((await as(lia).notices()).requests).toEqual([])
      expect((await as(nei).notices()).accepted.map((a) => a.id)).toEqual([
        lia.id,
        mar.id
      ])

      // Aceite com mais de 30 dias não aparece.
      await db
        .update(friendship)
        .set({ acceptedAt: new Date(Date.now() - 31 * 86_400_000) })
        .where(eq(friendship.addresseeId, oto.id))
      expect((await as(lia).notices()).accepted.map((a) => a.id)).toEqual([
        mar.id
      ])
    } finally {
      await db.delete(user).where(
        inArray(
          user.id,
          people.map((p) => p.id)
        )
      )
    }
  }
)

integrationTest(
  'perfil do amigo: jogo com código de várias pessoas conta uma vez, e os bares em comum saem do mais recente',
  async () => {
    const { db, appRouter } = await load()
    const { bar, event, sport } = await import(
      '@findsports_oficial/db/schema/platform'
    )
    const { reservation, reservationCode, reservationCodeUse } = await import(
      '@findsports_oficial/db/schema/reservation'
    )
    const { monthStart } = await import('../lib/friends')
    const fans = { ana: crypto.randomUUID(), beto: crypto.randomUUID() }
    const owners = [1, 2, 3].map(() => crypto.randomUUID())
    const bars = owners.map(() => crypto.randomUUID())
    const sportId = crypto.randomUUID()
    const start = monthStart()
    await db.insert(user).values([
      ...Object.entries(fans).map(([name, id]) => ({
        id,
        name,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true,
        activityVisibility: 'friends' as const
      })),
      ...owners.map((id) => ({
        id,
        name: 'Dono',
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const
      }))
    ])
    await db.insert(friendship).values({
      requesterId: fans.ana,
      addresseeId: fans.beto,
      via: 'search',
      acceptedAt: new Date()
    })
    await db.insert(bar).values(
      bars.map((id, i) => ({
        id,
        userId: owners[i] ?? '',
        name: `Bar do perfil ${i + 1}`,
        address: 'Rua descartável, 1',
        neighborhood: `Bairro ${i + 1}`,
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: true
      }))
    )
    await db
      .insert(sport)
      .values({ id: sportId, name: `Esporte ${sportId}`, slug: sportId })
    // Dois jogos neste mês (bares 1 e 2) e um no mês passado (bar 3).
    const games = await db
      .insert(event)
      .values(
        [
          new Date(start.getTime() + 3_600_000),
          new Date(start.getTime() + 2 * 3_600_000),
          new Date(start.getTime() - 5 * 86_400_000)
        ].map((startsAt, i) => ({
          barId: bars[i] ?? '',
          sportId,
          championship: 'Campeonato de integração',
          startsAt
        }))
      )
      .returning({ id: event.id })
    const visit = async (userId: string, game: number, uses: number) => {
      const [res] = await db
        .insert(reservation)
        .values({
          eventId: games[game]?.id ?? '',
          userId,
          partySize: uses,
          status: 'confirmed'
        })
        .returning({ id: reservation.id })
      const [code] = await db
        .insert(reservationCode)
        .values({
          code: `PF${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          reservationId: res?.id ?? '',
          maxUses: uses
        })
        .returning({ id: reservationCode.id })
      await db.insert(reservationCodeUse).values(
        Array.from({ length: uses }, () => ({
          id: crypto.randomUUID(),
          codeId: code?.id ?? '',
          validatedByUserId: owners[game] ?? ''
        }))
      )
    }
    try {
      // Ana levou duas pessoas no jogo do bar 1: três chegadas, um jogo.
      await visit(fans.ana, 0, 3)
      await visit(fans.ana, 1, 1)
      await visit(fans.ana, 2, 1)
      await visit(fans.beto, 0, 1)
      await visit(fans.beto, 2, 1)

      const as = (id: string) => appRouter.createCaller(contextFor(id, 'fan'))
      const profile = await as(fans.beto).friends.profile({ userId: fans.ana })
      if (!profile.visible) throw new Error('perfil deveria estar visível')
      expect(profile.month.them).toMatchObject({
        bars: 2,
        games: 2,
        neighborhoods: 2
      })
      expect(profile.month.me).toMatchObject({
        bars: 1,
        games: 1,
        neighborhoods: 1
      })
      expect(profile.barsInCommon.map((b) => b.id)).toEqual([
        bars[0] ?? '',
        bars[2] ?? ''
      ])
      expect(profile.level).toEqual(
        (await as(fans.ana).achievements.mine()).level
      )
    } finally {
      await db
        .delete(user)
        .where(inArray(user.id, [...owners, ...Object.values(fans)]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
