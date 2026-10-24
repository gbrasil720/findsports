import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { event } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, refusal, seedBar } from './integration-seed'

/**
 * Jogo em rascunho (WEB-436): só o painel vê. Fica fora da página do bar, da
 * busca e do "Vou assistir", não gasta o limite do Starter e só vai ao ar pelo
 * "Publicar", que confere o limite nessa hora.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'rascunho fica fora do app e do limite; publicar confere o limite',
  async () => {
    const seed = await seedBar('starter', 'active', inAMonth())
    try {
      // Cinco jogos publicados: o Starter está no limite.
      const games = []
      for (let i = 0; i < 5; i++) games.push(await seed.seedGame())
      const [first] = await seed.db
        .select({ sportId: event.sportId })
        .from(event)
        .where(eq(event.id, games[0] as string))
      const sportId = first?.sportId as string
      const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString()

      // No limite, publicar é recusado e rascunho entra.
      expect(
        (
          await refusal(
            seed.owner.pub.createEvent({
              sportId,
              championship: 'Publicado demais',
              startsAt
            })
          )
        ).code
      ).toBe('FORBIDDEN')
      await seed.owner.pub.createEvent({
        sportId,
        championship: 'Rascunho de integração',
        startsAt,
        draft: true
      })
      const draft = (await seed.owner.pub.getMyEvents()).find(
        (item) => item.championship === 'Rascunho de integração'
      )
      expect(draft?.publishedAt).toBeNull()
      const draftId = draft?.id as string
      expect(await seed.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        used: 5,
        canCreate: false
      })

      // O torcedor não vê nem marca presença.
      const profile = await seed.fan.pubs.getById({ id: seed.barId })
      expect(profile.events.map((item) => item.id)).not.toContain(draftId)
      expect(
        (
          await refusal(
            seed.fan.attendance.set({ eventId: draftId, attending: true })
          )
        ).code
      ).toBe('NOT_FOUND')

      // Publicar no limite é recusado; com vaga, vai ao ar e passa a contar.
      expect(
        (
          await refusal(
            seed.owner.pub.updateEvent({ eventId: draftId, publish: true })
          )
        ).code
      ).toBe('FORBIDDEN')
      await seed.owner.pub.deleteEvent({ eventId: games[4] as string })
      await seed.owner.pub.updateEvent({ eventId: draftId, publish: true })

      const published = (await seed.owner.pub.getMyEvents()).find(
        (item) => item.id === draftId
      )
      expect(published?.publishedAt).not.toBeNull()
      expect(await seed.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        used: 5,
        canCreate: false
      })
      const after = await seed.fan.pubs.getById({ id: seed.barId })
      expect(after.events.map((item) => item.id)).toContain(draftId)
    } finally {
      await seed.cleanup()
    }
  }
)

integrationTest('bar só com rascunho não aparece na busca', async () => {
  // Coordenada só deste teste: o banco é compartilhado.
  const lat = -9.123_45
  const lng = -50.678_91
  const seed = await seedBar('elite', 'active', inAMonth(), {
    latitude: lat.toFixed(8),
    longitude: lng.toFixed(8)
  })
  try {
    const draftId = await seed.seedGame({
      startsAt: new Date(Date.now() + 86_400_000),
      publishedAt: null
    })
    const found = async (radiusKm: number) =>
      (await seed.fan.pubs.search({ lat, lng, radiusKm, limit: 20 })).bars.map(
        (item) => item.id
      )
    expect(await found(1)).not.toContain(seed.barId)

    await seed.owner.pub.updateEvent({ eventId: draftId, publish: true })
    // Outro raio: outra chave do cache da busca.
    expect(await found(2)).toContain(seed.barId)
  } finally {
    await seed.cleanup()
  }
})
