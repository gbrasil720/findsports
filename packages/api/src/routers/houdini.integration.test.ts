import { expect, test } from 'bun:test'
import { eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  contextFor,
  inAMonth,
  load,
  seedBar,
  withClock
} from './integration-seed'

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
  'Jogos do trilho conta o que a tela Jogos lista: publicado e não acabado',
  async () => {
    const caller = await admin()
    const listed = async () =>
      (await caller.adminEvents.list({ period: 'all' })).total
    const [before, beforeListed] = await Promise.all([
      caller.houdini.overview(),
      listed()
    ])
    const seeded = await seedBar('pro', 'active', inAMonth())
    try {
      await seeded.seedGame()
      // Começou há meia hora e ainda não acabou: a tela lista.
      await seeded.seedGame({ startsAt: inDays(-1 / 48) })
      // Rascunhos (WEB-436) e jogo que já acabou ficam fora dos dois.
      await seeded.seedGame({ publishedAt: null })
      await seeded.seedGame({ publishedAt: null })
      await seeded.seedGame({
        startsAt: inDays(-1),
        endsAt: inDays(-1 + 1 / 12)
      })

      const after = await caller.houdini.overview()
      expect(after.jogosFuturos - before.jogosFuturos).toBe(2)
      expect((await listed()) - beforeListed).toBe(2)
    } finally {
      await seeded.cleanup()
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

integrationTest(
  'ampulheta separa os testes da semana e os bares que saíram do ar',
  async () => {
    const caller = await admin()
    const inTwo = await seedBar('pro', 'trialing', inDays(2))
    // Venceu e ainda espera a reconciliação: hoje, já sem plano.
    const overdue = await seedBar('elite', 'trialing', inDays(-0.01))
    const later = await seedBar('elite', 'trialing', inDays(10))
    const stripeTrial = await seedBar('pro', 'trialing', inDays(1))
    const gone = await seedBar('elite', 'trialing', inDays(-2), {
      isActive: false
    })
    const longGone = await seedBar('elite', 'trialing', inDays(-10), {
      isActive: false
    })
    const takenOff = await seedBar('starter', 'trialing', inDays(-1), {
      isActive: false
    })
    const seeds = [inTwo, overdue, later, stripeTrial, gone, longGone, takenOff]
    try {
      await inTwo.seedGame()
      // Rascunho (WEB-436) não é jogo marcado.
      await inTwo.seedGame({ publishedAt: null })
      await stripeTrial.db
        .update(subscription)
        .set({ externalSubscriptionId: `sub_${crypto.randomUUID()}` })
        .where(eq(subscription.barId, stripeTrial.barId))
      const { recordAdminAction } = await import(
        '@findsports_oficial/db/admin-action'
      )
      await recordAdminAction({
        kind: 'bar.take_off_air',
        actorId: crypto.randomUUID(),
        actorName: 'Admin de integração',
        targetType: 'bar',
        targetId: takenOff.barId,
        targetLabel: 'Bar de integração'
      })

      const { ending, gone: off } = await caller.houdini.ampulheta()
      const mine = (ids: string[]) =>
        ids.filter((id) => seeds.some((s) => s.barId === id))
      expect(mine(ending.map((b) => b.id))).toEqual([
        overdue.barId,
        inTwo.barId
      ])
      expect(ending.find((b) => b.id === inTwo.barId)).toMatchObject({
        day: 2,
        currentPlan: 'pro',
        upcomingGames: 1
      })
      expect(ending.find((b) => b.id === overdue.barId)).toMatchObject({
        day: 0,
        currentPlan: null
      })
      expect(mine(off.map((b) => b.id))).toEqual([gone.barId])
      expect(off.find((b) => b.id === gone.barId)).toMatchObject({
        daysAgo: 2,
        plan: 'elite'
      })
    } finally {
      for (const seed of seeds) await seed.cleanup()
    }
  }
)

// `starts_at` é `timestamp` em UTC: comparado com `now()` cru, a sessão em
// Brasília contava como futuro o jogo que começou há até 3 h.
for (const session of ['UTC', 'America/Sao_Paulo']) {
  integrationTest(
    `ampulheta conta só os jogos que ainda vão começar (sessão ${session})`,
    () =>
      withClock({ session }, async () => {
        const caller = await admin()
        const seed = await seedBar('pro', 'trialing', inDays(2))
        try {
          await seed.seedGame({
            startsAt: new Date(Date.now() - 2 * 3_600_000)
          })
          await seed.seedGame()
          const { ending } = await caller.houdini.ampulheta()
          expect(ending.find((b) => b.id === seed.barId)?.upcomingGames).toBe(1)
        } finally {
          await seed.cleanup()
        }
      })
  )
}

integrationTest(
  'pedeAMao traz fatura sem pagar, busca atrás do plano e teste de hoje',
  async () => {
    const caller = await admin()
    const unpaid = await seedBar('pro', 'past_due', inAMonth())
    const behind = await seedBar('starter', 'active', inAMonth())
    // Venceu há uma hora e segue no ar à espera da reconciliação: é de hoje.
    const today = await seedBar('elite', 'trialing', inDays(-1 / 24))
    const later = await seedBar('elite', 'trialing', inDays(3))
    const seeds = [unpaid, behind, today, later]
    try {
      await behind.db
        .update(bar)
        .set({ plan: 'elite' })
        .where(eq(bar.id, behind.barId))
      await later.db
        .update(bar)
        .set({
          descriptionPending: 'Telão e chope.',
          descriptionReview: 'pending'
        })
        .where(eq(bar.id, later.barId))

      const { pastDue, drift, endingToday, review, stuckAi } =
        await caller.houdini.pedeAMao()
      expect(review.descriptions).toBeGreaterThanOrEqual(1)
      expect(stuckAi).toBeGreaterThanOrEqual(0)
      expect(pastDue.find((b) => b.id === unpaid.barId)).toMatchObject({
        plan: 'pro'
      })
      expect(drift.find((b) => b.id === behind.barId)).toMatchObject({
        barPlan: 'elite',
        expectedSearchPlan: 'starter'
      })
      expect(endingToday.some((b) => b.id === today.barId)).toBe(true)
      expect(endingToday.some((b) => b.id === later.barId)).toBe(false)

      const overview = await caller.houdini.overview()
      expect(overview.bars.novos).toBeGreaterThanOrEqual(seeds.length)
      expect(overview.revisao).toBeGreaterThanOrEqual(1)
    } finally {
      for (const seed of seeds) await seed.cleanup()
    }
  }
)

integrationTest('houdini é só de admin', async () => {
  const { appRouter } = await load()
  const caller = appRouter.createCaller(contextFor(crypto.randomUUID(), 'pub'))
  await expect(caller.houdini.pedeAMao()).rejects.toThrow()
  await expect(caller.houdini.overview()).rejects.toThrow()
  await expect(caller.houdini.coelhos({})).rejects.toThrow()
  await expect(caller.houdini.search({ q: 'a' })).rejects.toThrow()
  await expect(caller.houdini.ampulheta()).rejects.toThrow()
})
