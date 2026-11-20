import { expect, test } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, inArray, or } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Achados de segurança dos amigos: convite que passava por cima de "Quem pode
 * te adicionar", código e contatos sem limite de tentativas, cidade exposta.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

async function seed(keys: string[]) {
  const { db, appRouter } = await load()
  const tag = crypto.randomUUID().slice(0, 8)
  const people = keys.map((key) => ({
    id: crypto.randomUUID(),
    name: `${key} Seg${tag}`,
    email: `${key}-${tag}@integration.invalid`
  }))
  await db.insert(user).values(
    people.map((p) => ({
      ...p,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true,
      searchCityName: `Cidade ${tag}`
    }))
  )
  const as = (p: { id: string }, now = new Date()) =>
    appRouter.createCaller(contextFor(p.id, 'fan', now)).friends
  const cleanup = () =>
    db.delete(user).where(
      inArray(
        user.id,
        people.map((p) => p.id)
      )
    )
  return { db, people, as, tag, cleanup }
}

integrationTest(
  'convite vira pedido pendente e respeita "Quem pode te adicionar"',
  async () => {
    const { db, people, as, cleanup } = await seed([
      'Vera',
      'Fabio',
      'Nina',
      'Otto'
    ])
    const [vera, fabio, nina, otto] = people as [
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0]
    ]
    try {
      const veraCode = (await as(vera).me()).friendCode
      const fabioCode = (await as(fabio).me()).friendCode
      await as(vera).updatePrivacy({ friendRequestsFrom: 'nobody' })
      await as(fabio).updatePrivacy({
        friendRequestsFrom: 'friends_of_friends'
      })

      // Conta nova (agora) com o código de quem escolheu "Ninguém".
      await expect(as(nina).joinByInvite({ code: veraCode })).rejects.toThrow(
        'não recebe pedidos'
      )
      // "Amigos de amigos" sem ninguém em comum também recusa.
      await expect(as(nina).joinByInvite({ code: fabioCode })).rejects.toThrow(
        'amigos de amigos'
      )
      const rows = await db
        .select()
        .from(friendship)
        .where(
          or(
            eq(friendship.requesterId, nina.id),
            eq(friendship.addresseeId, nina.id)
          )
        )
      expect(rows).toEqual([])

      // Mesmo de quem aceita pedido de todos, o convite é um pedido: "todos"
      // é quem pode pedir, não quem vira amigo sem aceitar.
      const ottoCode = (await as(otto).me()).friendCode
      expect((await as(nina).joinByInvite({ code: ottoCode })).relation).toBe(
        'sent'
      )
      const [pending] = await db
        .select({ at: friendship.acceptedAt })
        .from(friendship)
        .where(
          and(
            eq(friendship.requesterId, nina.id),
            eq(friendship.addresseeId, otto.id)
          )
        )
      expect(pending).toEqual({ at: null })
    } finally {
      await cleanup()
    }
  }
)

integrationTest('código de amigo tem limite de tentativas', async () => {
  const { people, as, cleanup } = await seed(['Gil'])
  const [gil] = people as [(typeof people)[0]]
  try {
    // byCode e joinByInvite dividem a mesma janela: 10 por hora.
    for (let i = 0; i < 9; i++) await as(gil).byCode({ code: `ZZ-${i}` })
    await expect(as(gil).joinByInvite({ code: 'ZZ-0000' })).rejects.toThrow(
      'Esse convite não vale mais'
    )
    await expect(as(gil).byCode({ code: 'ZZ-9999' })).rejects.toThrow(
      'Muitas tentativas'
    )
    await expect(as(gil).joinByInvite({ code: 'ZZ-9999' })).rejects.toThrow(
      'Muitas tentativas'
    )
  } finally {
    await cleanup()
  }
})

integrationTest(
  'contatos: 500 hashes por dia, conta de mais de um dia e sem cidade',
  async () => {
    const { people, as, cleanup } = await seed(['Hugo', 'Iris'])
    const [hugo, iris] = people as [(typeof people)[0], (typeof people)[0]]
    const hash = (email: string) =>
      createHash('sha256').update(email.toLowerCase()).digest('hex')
    const filler = (n: number) =>
      Array.from({ length: n }, () => randomBytes(32).toString('hex'))
    // A idade vem do createdAt da sessão.
    const old = new Date(Date.now() - 2 * 86_400_000)
    const young = new Date(Date.now() - 23 * 3_600_000)
    try {
      await expect(
        as(hugo, young).matchContacts({ hashes: [hash(iris.email)] })
      ).rejects.toThrow('Conta nova')
      const matched = await as(hugo, old).matchContacts({
        hashes: [hash(iris.email), ...filler(199)]
      })
      expect(matched.map((m) => [m.id, m.city])).toEqual([[iris.id, null]])
      // "Me encontrar pelo e-mail" desligado: some dos contatos.
      expect((await as(iris).me()).findableByEmail).toBe(true)
      await as(iris).updatePrivacy({ findableByEmail: false })
      expect((await as(iris).me()).findableByEmail).toBe(false)
      expect(
        await as(hugo, old).matchContacts({ hashes: [hash(iris.email)] })
      ).toEqual([])
      await as(hugo, old).matchContacts({ hashes: filler(299) })
      // A janela do dia conta hashes, não chamadas: o próximo passa do teto.
      await expect(
        as(hugo, old).matchContacts({ hashes: filler(1) })
      ).rejects.toThrow('Muitos contatos')
    } finally {
      await cleanup()
    }
  }
)

integrationTest(
  'contatos: chamada com mais de 500 conta só os 500 primeiros',
  async () => {
    const { people, as, cleanup } = await seed(['Ivo', 'Jade'])
    const [ivo, jade] = people as [(typeof people)[0], (typeof people)[0]]
    const hash = (email: string) =>
      createHash('sha256').update(email.toLowerCase()).digest('hex')
    const filler = (n: number) =>
      Array.from({ length: n }, () => randomBytes(32).toString('hex'))
    const old = new Date(Date.now() - 2 * 86_400_000)
    try {
      // App publicado manda até 2000: o hash depois do 500º não é conferido.
      expect(
        await as(ivo, old).matchContacts({
          hashes: [...filler(500), hash(jade.email)]
        })
      ).toEqual([])
      await expect(
        as(ivo, old).matchContacts({ hashes: filler(1) })
      ).rejects.toThrow('Muitos contatos')
    } finally {
      await cleanup()
    }
  }
)

integrationTest('cidade só para amigo, e "Ninguém" fora da busca', async () => {
  const { db, people, as, tag, cleanup } = await seed([
    'Joana',
    'Kleber',
    'Lia'
  ])
  const [joana, kleber, lia] = people as [
    (typeof people)[0],
    (typeof people)[0],
    (typeof people)[0]
  ]
  try {
    const found = await as(joana).search({ query: `seg${tag}` })
    expect(found.length).toBe(2)
    expect(found.every((p) => p.city === null)).toBe(true)
    expect(
      (await as(joana).byCode({ code: (await as(lia).me()).friendCode }))?.city
    ).toBeNull()
    expect((await as(joana).profile({ userId: lia.id })).city).toBeNull()

    // "Perto de você" continua filtrando pela cidade, sem devolvê-la.
    const near = await as(joana).search({ query: '', scope: 'near' })
    expect(near.map((p) => p.id).sort()).toEqual([kleber.id, lia.id].sort())
    expect(near.every((p) => p.city === null)).toBe(true)

    // Amigo aceito vê a cidade na lista de amigos.
    await as(joana).request({ userId: kleber.id })
    await as(kleber).respond({ userId: joana.id, accept: true })
    const overview = await as(joana).overview()
    expect(overview.friends.map((f) => f.city)).toEqual([`Cidade ${tag}`])

    // Prévia do convite: cidade só para amigo aceito.
    const liaCode = (await as(lia).me()).friendCode
    const kleberCode = (await as(kleber).me()).friendCode
    expect((await as(joana).invitePreview({ code: liaCode }))?.city).toBeNull()
    expect((await as(joana).invitePreview({ code: kleberCode }))?.city).toBe(
      `Cidade ${tag}`
    )

    // Quem escolheu "Ninguém" some da busca por nome para quem não é amigo.
    await db
      .update(user)
      .set({ friendRequestsFrom: 'nobody' })
      .where(inArray(user.id, [kleber.id, lia.id]))
    const after = await as(joana).search({ query: `seg${tag}` })
    expect(after.map((p) => p.id)).toEqual([kleber.id])
  } finally {
    await cleanup()
  }
})
