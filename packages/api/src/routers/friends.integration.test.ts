import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
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
    expect(anaMe.friendCode).toMatch(/^AT-\d{4}$/)
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
    const byCode = await as(eva).byCode({ code: anaMe.friendCode.toLowerCase() })
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
