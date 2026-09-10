import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

/**
 * `bar.is_active` nasce `false`, e `pubs.getById` respondia `NOT_FOUND` para
 * qualquer bar inativo — inclusive para a conta dona dele. O painel do bar
 * oferece "como o torcedor vê" com link para essa página, então o dono clicava
 * na prévia do próprio cadastro e recebia "Bar não encontrado.".
 *
 * A exceção é do dono e só dele: qualquer outra conta continua sem enxergar
 * um bar que ainda não foi publicado.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function contextFor(
  userId: string,
  role: 'pub' | 'fan',
  now = new Date()
) {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: `Conta ${role}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role,
        banned: false,
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

integrationTest(
  'o dono abre a prévia do próprio bar inativo; mais ninguém abre',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const ownerId = crypto.randomUUID()
    const fanId = crypto.randomUUID()
    const barId = crypto.randomUUID()

    await db.insert(user).values([
      {
        id: ownerId,
        name: 'Dono de integração',
        email: `${ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: true
      },
      {
        id: fanId,
        name: 'Torcedor de integração',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      }
    ])

    try {
      await db.insert(bar).values({
        id: barId,
        userId: ownerId,
        name: 'Bar ainda não publicado',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: false
      })

      const asOwner = appRouter.createCaller(contextFor(ownerId, 'pub'))
      const preview = await asOwner.pubs.getById({ id: barId })
      expect(preview.isOwner).toBe(true)
      // A prévia precisa dizer que ainda está fora do ar: é o que separa
      // "ninguém vê isto" de "assim é o que o torcedor vê".
      expect(preview.isActive).toBe(false)

      const asFan = appRouter.createCaller(contextFor(fanId, 'fan'))
      await expect(asFan.pubs.getById({ id: barId })).rejects.toThrow(
        'Bar não encontrado.'
      )

      // Publicado, volta a ser bar de todo mundo.
      await db.update(bar).set({ isActive: true }).where(eq(bar.id, barId))
      const publicado = await asFan.pubs.getById({ id: barId })
      expect(publicado.id).toBe(barId)
      expect(publicado.isOwner).toBe(false)
    } finally {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
    }
  }
)
