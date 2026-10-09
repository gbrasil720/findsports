import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'cidade do torcedor: o onboarding grava, o perfil troca e conta sem cidade lê null (WEB-319)',
  async () => {
    const { db, appRouter } = await load()
    const sportId = crypto.randomUUID()
    const withCityId = crypto.randomUUID()
    const withoutCityId = crypto.randomUUID()

    await db.insert(sport).values({
      id: sportId,
      name: 'Futebol',
      slug: `futebol-${crypto.randomUUID()}`
    })
    await db.insert(user).values(
      [withCityId, withoutCityId].map((id) => ({
        id,
        name: 'Fan de cidade',
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const
      }))
    )
    const callerFor = (id: string, onboardingCompleted: boolean) =>
      appRouter.createCaller(
        contextFor(id, 'fan', new Date(), { onboardingCompleted })
      )

    try {
      // Cidade fora da lista recusa o onboarding inteiro: nada fica gravado.
      await expect(
        callerFor(withCityId, false).onboarding.completeFan({
          sportIds: [sportId],
          searchRadiusKm: 3,
          city: { name: 'Gotham', uf: 'SP' }
        })
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT' })
      const [pending] = await db
        .select({ done: user.onboardingCompleted })
        .from(user)
        .where(eq(user.id, withCityId))
      expect(pending?.done).toBe(false)

      // Sem acento e em minúscula: o que fica é o nome oficial e a sede.
      await callerFor(withCityId, false).onboarding.completeFan({
        sportIds: [sportId],
        searchRadiusKm: 3,
        city: { name: 'sao jose dos campos', uf: 'sp' }
      })
      const fan = callerFor(withCityId, true)
      expect(await fan.pubs.getMyCity()).toEqual({
        name: 'São José dos Campos',
        uf: 'SP',
        lat: expect.closeTo(-23.2, 1),
        lng: expect.closeTo(-45.9, 1)
      })

      // Onboarding sem cidade — o app de antes do campo — conclui e lê null.
      await callerFor(withoutCityId, false).onboarding.completeFan({
        sportIds: [sportId],
        searchRadiusKm: 5
      })
      expect(await callerFor(withoutCityId, true).pubs.getMyCity()).toBeNull()

      // O perfil troca a cidade, e a recusa não apaga a que estava salva.
      expect(
        await fan.pubs.updateMyCity({ name: 'Campinas', uf: 'SP' })
      ).toMatchObject({ name: 'Campinas', uf: 'SP' })
      await expect(
        fan.pubs.updateMyCity({ name: 'Campinas', uf: 'RJ' })
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT' })
      expect(await fan.pubs.getMyCity()).toMatchObject({
        name: 'Campinas',
        uf: 'SP'
      })
    } finally {
      await db.delete(user).where(inArray(user.id, [withCityId, withoutCityId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
