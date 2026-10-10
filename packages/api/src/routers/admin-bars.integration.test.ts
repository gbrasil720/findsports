import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { stripeSubscription, user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * `/internal/bars` (WEB-354) contra o banco de verdade: a busca pelos três
 * caminhos do suporte e o plano efetivo saindo da mesma regra do app.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const DAY = 24 * 3_600_000

async function admin() {
  const { appRouter } = await load()
  return appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
}

integrationTest('acha o bar por nome, e-mail do dono e id', async () => {
  const name = `Boteco ${crypto.randomUUID()}`
  const seeded = await seedBar('pro', 'active', new Date(Date.now() + DAY), {
    name
  })
  try {
    const caller = await admin()
    const [owner] = await seeded.db
      .select({ id: bar.userId, email: user.email })
      .from(bar)
      .innerJoin(user, eq(user.id, bar.userId))
      .where(eq(bar.id, seeded.barId))

    // Pedaço do nome em outra caixa, e-mail do dono, id do bar e id do dono.
    for (const search of [
      name.slice(0, 20).toUpperCase(),
      owner?.email,
      seeded.barId,
      owner?.id
    ]) {
      const result = await caller.adminBars.list({ search })
      expect(result.matched, search).toBe(1)
      expect(result.bars[0]).toMatchObject({
        id: seeded.barId,
        name,
        ownerEmail: owner?.email
      })
    }

    // `%` e `_` são texto, não curinga.
    expect((await caller.adminBars.list({ search: '%' })).matched).toBe(0)
    // A segunda página de uma busca de um bar só vem vazia, com o total certo.
    const page2 = await caller.adminBars.list({ search: name, page: 2 })
    expect(page2).toMatchObject({ bars: [], matched: 1 })
  } finally {
    await seeded.cleanup()
  }
})

integrationTest('recusa dono de bar e torcedor', async () => {
  const seeded = await seedBar('pro', 'active', new Date(Date.now() + DAY))
  try {
    for (const caller of [seeded.owner, seeded.fan]) {
      expect((await refusal(caller.adminBars.list({}))).code).toBe('FORBIDDEN')
    }
  } finally {
    await seeded.cleanup()
  }
})

integrationTest(
  'trial vencido: sem plano efetivo, situação trial_ended',
  async () => {
    const ended = new Date(Date.now() - DAY)
    const seeded = await seedBar('elite', 'trialing', ended)
    try {
      const result = await (await admin()).adminBars.list({
        search: seeded.barId
      })
      expect(result.bars[0]).toMatchObject({
        subscription: {
          plan: 'elite',
          status: 'trialing',
          currentPeriodEnd: ended,
          provider: null,
          externalSubscriptionId: null
        },
        currentPlan: null,
        standing: 'trial_ended',
        stripeUrl: null,
        cancelAt: null,
        upcomingGames: 0
      })
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'assinatura ativa no Stripe: plano, link, cancelamento agendado e jogos futuros',
  async () => {
    const seeded = await seedBar('pro', 'active', new Date(Date.now() + DAY))
    const { db } = seeded
    const stripeId = `sub_${crypto.randomUUID()}`
    const cancelAt = new Date(Date.now() + 10 * DAY)
    cancelAt.setMilliseconds(0)
    const sportId = crypto.randomUUID()
    try {
      await db
        .update(subscription)
        .set({ provider: 'stripe', externalSubscriptionId: stripeId })
        .where(eq(subscription.barId, seeded.barId))
      const [owner] = await db
        .select({ id: bar.userId })
        .from(bar)
        .where(eq(bar.id, seeded.barId))
      await db.insert(stripeSubscription).values({
        id: crypto.randomUUID(),
        plan: 'pro',
        referenceId: owner?.id as string,
        stripeSubscriptionId: stripeId,
        status: 'active',
        cancelAt
      })
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      // Dois por vir e um que já começou: só os dois primeiros contam.
      await db.insert(event).values(
        [DAY, 2 * DAY, -DAY].map((offset) => ({
          barId: seeded.barId,
          sportId,
          championship: 'Campeonato de integração',
          startsAt: new Date(Date.now() + offset)
        }))
      )

      const result = await (await admin()).adminBars.list({
        search: seeded.barId
      })
      expect(result.bars).toHaveLength(1)
      expect(result.bars[0]).toMatchObject({
        isActive: true,
        barPlan: 'pro',
        currentPlan: 'pro',
        standing: 'current',
        stripeUrl: `https://dashboard.stripe.com/test/subscriptions/${stripeId}`,
        cancelAt,
        upcomingGames: 2
      })
    } finally {
      await seeded.cleanup()
      await db
        .delete(stripeSubscription)
        .where(eq(stripeSubscription.stripeSubscriptionId, stripeId))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

integrationTest(
  'bar sem assinatura aparece, sem plano nem situação',
  async () => {
    const seeded = await seedBar('starter', 'trialing', null)
    try {
      await seeded.db
        .delete(subscription)
        .where(eq(subscription.barId, seeded.barId))
      const result = await (await admin()).adminBars.list({
        search: seeded.barId
      })
      expect(result.bars[0]).toMatchObject({
        subscription: null,
        currentPlan: null,
        standing: null,
        stripeUrl: null
      })
    } finally {
      await seeded.cleanup()
    }
  }
)
