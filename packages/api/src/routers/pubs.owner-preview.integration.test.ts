import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

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

integrationTest(
  'o dono abre a prévia do próprio bar inativo; mais ninguém abre',
  async () => {
    const { db, appRouter } = await load()
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
      // Nunca publicado não é assinatura encerrada (WEB-345).
      expect(preview.offAirReason).toBeNull()

      const asFan = appRouter.createCaller(contextFor(fanId, 'fan'))
      await expect(asFan.pubs.getById({ id: barId })).rejects.toThrow(
        'Bar não encontrado.'
      )

      // Publicado, volta a ser bar de todo mundo.
      await db.update(bar).set({ isActive: true }).where(eq(bar.id, barId))
      const publicado = await asFan.pubs.getById({ id: barId })
      expect(publicado.id).toBe(barId)
      expect(publicado.isOwner).toBe(false)

      // Assinatura encerrada tira o bar do ar (`stripe-sync`): o dono recebe
      // o motivo, para o aviso da prévia não dizer "ainda fora do ar".
      await db.update(bar).set({ isActive: false }).where(eq(bar.id, barId))
      await db
        .insert(subscription)
        .values({ barId, plan: 'pro', status: 'cancelled' })
      const encerrado = await asOwner.pubs.getById({ id: barId })
      expect(encerrado.isActive).toBe(false)
      expect(encerrado.offAirReason).toBe('subscription')

      // Teste do cadastro vencido, fora do ar pela reconciliação (WEB-357):
      // também já esteve no ar, e a volta é contratar. Nunca houve assinatura
      // contratada, então o aviso fala do teste.
      await db
        .update(subscription)
        .set({ status: 'trialing', currentPeriodEnd: new Date(0) })
        .where(eq(subscription.barId, barId))
      const testeVencido = await asOwner.pubs.getById({ id: barId })
      expect(testeVencido.offAirReason).toBe('trial')
    } finally {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
    }
  }
)
