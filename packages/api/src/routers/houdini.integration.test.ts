import { expect, test } from 'bun:test'
import { eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, inAMonth, load, seedBar } from './integration-seed'

/** Início do Houdini e ⌘K (WEB-391). */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

async function admin() {
  const { appRouter } = await load()
  return appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
}

integrationTest(
  'overview conta pessoas novas, bares no ar e testes acabando',
  async () => {
    const caller = await admin()
    const before = await caller.houdini.overview()
    const ending = await seedBar('elite', 'trialing', inDays(3))
    const paying = await seedBar('pro', 'active', inAMonth())
    // Teste com cartão no Stripe não sai do ar ao vencer: fica fora dos
    // "testes acabando", mas segue em teste.
    const stripeTrial = await seedBar('pro', 'trialing', inDays(2))
    const offAir = await seedBar('starter', 'trialing', inDays(1), {
      isActive: false
    })
    try {
      await stripeTrial.db
        .update(subscription)
        .set({ externalSubscriptionId: `sub_${crypto.randomUUID()}` })
        .where(eq(subscription.barId, stripeTrial.barId))

      const after = await caller.houdini.overview()
      expect(after.people.total - before.people.total).toBe(8)
      expect(after.people.novas - before.people.novas).toBe(8)
      expect(after.bars.noAr - before.bars.noAr).toBe(3)
      expect(after.bars.emTeste - before.bars.emTeste).toBe(2)
      expect(after.bars.pagando - before.bars.pagando).toBe(1)
      expect(after.testesAcabando - before.testesAcabando).toBe(1)
      expect(after.fantasmas).toBeGreaterThanOrEqual(0)
    } finally {
      await ending.cleanup()
      await paying.cleanup()
      await stripeTrial.cleanup()
      await offAir.cleanup()
    }
  }
)

integrationTest(
  'coelhos traz conta nova, bar novo e assinatura mexida',
  async () => {
    const caller = await admin()
    const seeded = await seedBar('pro', 'active', inAMonth())
    try {
      // Só entra assinatura mexida depois do cadastro; a do seed acabou de nascer.
      const fresh = await caller.houdini.coelhos({ limit: 50 })
      expect(
        fresh.some((c) => c.type === 'subscription' && c.barId === seeded.barId)
      ).toBe(false)

      await seeded.db
        .update(subscription)
        .set({
          status: 'past_due',
          createdAt: sql`now() - interval '1 day'`
        })
        .where(eq(subscription.barId, seeded.barId))

      const feed = await caller.houdini.coelhos({ limit: 50 })
      expect(feed.find((c) => c.id === seeded.barId)).toMatchObject({
        type: 'bar',
        name: 'Bar de integração'
      })
      expect(feed.find((c) => c.id === seeded.fanId)).toMatchObject({
        type: 'person',
        role: 'fan'
      })
      expect(
        feed.find((c) => c.type === 'subscription' && c.barId === seeded.barId)
      ).toMatchObject({ status: 'past_due', plan: 'pro', stripe: false })
      const times = feed.map((c) => c.at.getTime())
      expect(times).toEqual([...times].sort((a, b) => b - a))
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'search acha por nome, e-mail, id e cliente do Stripe',
  async () => {
    const caller = await admin()
    const seeded = await seedBar('starter', 'active', inAMonth())
    const tag = crypto.randomUUID().slice(0, 8)
    const customer = `cus_${tag}`
    try {
      const [owner] = await seeded.db
        .select({ id: bar.userId })
        .from(bar)
        .where(eq(bar.id, seeded.barId))
      if (!owner) throw new Error('dono não achado')
      await seeded.db
        .update(user)
        .set({ name: `Dona ${tag}`, stripeCustomerId: customer })
        .where(eq(user.id, owner.id))
      await seeded.db
        .update(bar)
        .set({ name: `Bar ${tag}` })
        .where(eq(bar.id, seeded.barId))

      const byName = await caller.houdini.search({ q: tag.toUpperCase() })
      expect(byName.people.map((p) => p.id)).toContain(owner.id)
      expect(byName.bars.map((b) => b.id)).toEqual([seeded.barId])

      const byEmail = await caller.houdini.search({
        q: `${seeded.fanId}@integration`
      })
      expect(byEmail.people.map((p) => p.id)).toEqual([seeded.fanId])

      const byId = await caller.houdini.search({ q: seeded.barId })
      expect(byId.bars.map((b) => b.id)).toEqual([seeded.barId])

      const byCustomer = await caller.houdini.search({ q: customer })
      expect(byCustomer.people.map((p) => p.id)).toEqual([owner.id])
      expect(byCustomer.bars.map((b) => b.id)).toEqual([seeded.barId])

      // `_` é curinga no LIKE: sem escapar, `Dona_<tag>` casaria com o espaço.
      const escaped = await caller.houdini.search({ q: `Dona_${tag}` })
      expect(escaped.people.map((p) => p.id)).not.toContain(owner.id)
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest('houdini é só de admin', async () => {
  const { appRouter } = await load()
  const caller = appRouter.createCaller(contextFor(crypto.randomUUID(), 'pub'))
  await expect(caller.houdini.overview()).rejects.toThrow()
  await expect(caller.houdini.coelhos({})).rejects.toThrow()
  await expect(caller.houdini.search({ q: 'a' })).rejects.toThrow()
})
