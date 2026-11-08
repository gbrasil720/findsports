import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { type Plan, refusal, seedBar } from './integration-seed'

// WEB-358: o bar em teste grátis do cadastro troca de plano sem cartão.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const inDays = (days: number) => new Date(Date.now() + days * 24 * 3_600_000)

async function stored(t: Awaited<ReturnType<typeof seedBar>>) {
  const [row] = await t.db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      externalSubscriptionId: subscription.externalSubscriptionId,
      barPlan: bar.plan
    })
    .from(subscription)
    .innerJoin(bar, eq(bar.id, subscription.barId))
    .where(eq(subscription.barId, t.barId))
  return row
}

integrationTest(
  'teste do cadastro em vigor: troca de plano quantas vezes quiser, sem mexer no fim do teste, e o limite do Starter vale na hora',
  async () => {
    const trialEnd = inDays(90)
    const t = await seedBar('elite', 'trialing', trialEnd)
    const sportId = crypto.randomUUID()
    try {
      await t.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await t.db.insert(event).values(
        Array.from({ length: 6 }, (_, index) => ({
          barId: t.barId,
          sportId,
          championship: `Jogo do teste ${index + 1}`,
          startsAt: inDays(index + 1)
        }))
      )
      expect(await t.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        status: 'unlimited'
      })

      expect(await t.owner.pub.changeTrialPlan({ plan: 'starter' })).toEqual({
        plan: 'starter'
      })
      expect(await stored(t)).toEqual({
        plan: 'starter',
        status: 'trialing',
        currentPeriodEnd: trialEnd,
        externalSubscriptionId: null,
        // Projeção da trigger `subscription_bar_plan_sync`.
        barPlan: 'starter'
      })
      expect(await t.owner.pub.getMySubscription()).toMatchObject({
        currentPlan: 'starter',
        standing: 'current'
      })

      // Os seis jogos criados no Elite já contam, menos o primeiro, que é por
      // conta da Onside: o sétimo é recusado.
      expect(await t.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        status: 'limited',
        canCreate: false,
        used: 5
      })
      expect(
        await refusal(
          t.owner.pub.createEvent({
            sportId,
            championship: 'Sétimo jogo',
            startsAt: inDays(10).toISOString()
          })
        )
      ).toMatchObject({ code: 'FORBIDDEN' })

      for (const plan of ['pro', 'elite'] satisfies Plan[]) {
        expect(await t.owner.pub.changeTrialPlan({ plan })).toEqual({ plan })
        expect(await stored(t)).toMatchObject({
          plan,
          barPlan: plan,
          currentPeriodEnd: trialEnd
        })
      }
      expect(await t.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        status: 'unlimited'
      })
    } finally {
      await t.cleanup()
      await t.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

integrationTest(
  'assinatura no Stripe, teste vencido e plano pago não trocam por aqui, e nada é gravado',
  async () => {
    const contratado = await seedBar('elite', 'trialing', inDays(30))
    await contratado.db
      .update(subscription)
      .set({
        provider: 'stripe',
        externalSubscriptionId: `sub_${contratado.barId}`
      })
      .where(eq(subscription.barId, contratado.barId))
    const vencido = await seedBar('elite', 'trialing', inDays(-1))
    const semData = await seedBar('elite', 'trialing', null)
    const pago = await seedBar('elite', 'active', inDays(30))
    const todos = [contratado, vencido, semData, pago]
    try {
      for (const t of todos) {
        const before = await stored(t)
        expect(
          await refusal(t.owner.pub.changeTrialPlan({ plan: 'starter' }))
        ).toMatchObject({ code: 'PRECONDITION_FAILED' })
        expect(await stored(t)).toEqual(before)
      }
    } finally {
      for (const t of todos) await t.cleanup()
    }
  }
)

integrationTest('só o dono troca, e só para um plano que existe', async () => {
  const t = await seedBar('elite', 'trialing', inDays(30))
  try {
    expect(
      await refusal(t.fan.pub.changeTrialPlan({ plan: 'starter' }))
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await refusal(t.owner.pub.changeTrialPlan({ plan: 'vitalicio' as Plan }))
    ).toMatchObject({ code: 'BAD_REQUEST' })
    expect(await stored(t)).toMatchObject({ plan: 'elite' })
  } finally {
    await t.cleanup()
  }
})

integrationTest(
  'primeiro jogo por conta da Onside: o Starter publica o primeiro e mais cinco, e só então para',
  async () => {
    const t = await seedBar('starter', 'active', inDays(20))
    const sportId = crypto.randomUUID()
    try {
      await t.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      const create = (n: number) =>
        t.owner.pub.createEvent({
          sportId,
          championship: `Jogo ${n}`,
          startsAt: inDays(n).toISOString()
        })
      await create(1)
      expect(await t.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        status: 'limited',
        used: 0,
        remaining: 5
      })
      // Rascunho não conta nem vira o primeiro (WEB-436).
      await t.owner.pub.createEvent({
        sportId,
        championship: 'Rascunho',
        startsAt: inDays(2).toISOString(),
        draft: true
      })
      for (const n of [2, 3, 4, 5, 6]) await create(n)
      expect(await t.owner.pub.getMyEventCreationPolicy()).toMatchObject({
        used: 5,
        remaining: 0,
        canCreate: false
      })
      expect(await refusal(create(7))).toMatchObject({ code: 'FORBIDDEN' })
    } finally {
      await t.cleanup()
      await t.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
