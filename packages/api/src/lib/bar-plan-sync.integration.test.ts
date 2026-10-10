import { expect, test } from 'bun:test'
import { applyStripeSubscription } from '@findsports_oficial/auth/stripe-sync'
import { db, eq, inArray, sql } from '@findsports_oficial/db'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, refusal, seedBar } from '../routers/integration-seed'
import { resetAppConfig, setAppConfig } from './app-config'
import { reconcileBarPlans } from './bar-plan-sync'

/**
 * `bar.plan` projeta o plano vigente (WEB-129), contra o banco de verdade:
 * a trigger rebaixa na mudança de status, e a reconciliação cobre o que
 * nenhuma escrita em `subscription` avisa — o trial que vence pelo relógio.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'plano parado sai de bar.plan e do perfil público; o vigente volta',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const projected = async () => {
      const [row] = await ctx.db
        .select({ plan: bar.plan })
        .from(bar)
        .where(eq(bar.id, ctx.barId))
      return row?.plan
    }
    const setSubscription = (values: {
      status: 'trialing' | 'active' | 'past_due' | 'inactive'
      currentPeriodEnd: Date | null
    }) =>
      ctx.db
        .update(subscription)
        .set(values)
        .where(eq(subscription.barId, ctx.barId))

    try {
      expect(await projected()).toBe('elite')

      await setSubscription({ status: 'past_due', currentPeriodEnd: null })
      expect(await projected()).toBe('starter')
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).plan).toBe(
        'starter'
      )

      await setSubscription({
        status: 'trialing',
        currentPeriodEnd: inAMonth()
      })
      expect(await projected()).toBe('elite')

      await setSubscription({
        status: 'trialing',
        currentPeriodEnd: new Date(Date.now() - 3_600_000)
      })
      expect(await projected()).toBe('starter')

      // Trial que venceu depois da última escrita: a projeção ficou para trás
      // e a trigger não tem como saber. É o caso da reconciliação.
      await ctx.db
        .update(bar)
        .set({ plan: 'elite' })
        .where(eq(bar.id, ctx.barId))
      expect(await reconcileBarPlans()).toBeGreaterThanOrEqual(1)
      expect(await projected()).toBe('starter')

      // O plano contratado continua guardado.
      const [stored] = await ctx.db
        .select({ plan: subscription.plan })
        .from(subscription)
        .where(eq(subscription.barId, ctx.barId))
      expect(stored?.plan).toBe('elite')
    } finally {
      await ctx.cleanup()
    }
  }
)

/**
 * WEB-357: o teste grátis do cadastro (sem cartão) que vence sem contratação
 * tira o bar do ar na reconciliação. Quem já tem assinatura no Stripe não
 * entra: ali quem decide é o webhook.
 */
integrationTest(
  'teste do cadastro vencido sai do ar na reconciliação e volta ao contratar; teste vigente, past_due e assinatura do Stripe continuam',
  async () => {
    // Longe de qualquer bar de seed ou de outro teste.
    const lat = -31.25
    const lng = -47.75
    const hourAgo = new Date(Date.now() - 3_600_000)
    const at = (index: number) => ({
      latitude: (lat + index * 0.001).toFixed(8),
      longitude: lng.toFixed(8)
    })
    const expired = await seedBar('elite', 'trialing', hourAgo, at(1))
    const live = await seedBar('elite', 'trialing', inAMonth(), at(2))
    const pastDue = await seedBar('elite', 'past_due', hourAgo, at(3))
    const onStripe = await seedBar('elite', 'trialing', hourAgo, at(4))
    const seeded = [expired, live, pastDue, onStripe]
    const sportId = crypto.randomUUID()
    const ids = (contexts: typeof seeded) =>
      contexts.map((context) => context.barId).sort()

    try {
      await db
        .update(subscription)
        .set({
          provider: 'stripe',
          externalSubscriptionId: `sub_${onStripe.barId}`
        })
        .where(eq(subscription.barId, onStripe.barId))
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `web-357-${sportId}`
      })
      await db.insert(event).values(
        seeded.map((context) => ({
          barId: context.barId,
          sportId,
          championship: `Jogo ${context.barId}`,
          startsAt: new Date(Date.now() + 3_600_000)
        }))
      )
      await setAppConfig('rating.public_display', true, null)

      // Coordenada própria por busca: a página fica em cache por 60 s.
      let step = 0
      const mine = (bars: { id: string }[]) =>
        bars
          .map((found) => found.id)
          .filter((id) => seeded.some((context) => context.barId === id))
          .sort()
      const search = async (sort?: 'rating') => {
        step += 1
        const page = await live.fan.pubs.search({
          lat,
          lng: lng + step * 0.002,
          radiusKm: 3,
          sort,
          limit: 20
        })
        return mine(page.bars)
      }
      const onMap = async () => {
        step += 1
        const page = await live.fan.pubs.searchByLocation({
          lat,
          lng: lng + step * 0.002,
          radiusKm: 3,
          limit: 20
        })
        return mine(page.bars)
      }
      // Em camadas, por avaliação, o de emergência e o mapa.
      const everywhere = async () => {
        const found = [await search(), await search('rating'), await onMap()]
        await setAppConfig('search.tiered_plan_query', false, null)
        found.push(await search())
        await resetAppConfig('search.tiered_plan_query')
        return found
      }

      // Antes do cron o teste vencido segue no ar: é o atraso de até um dia.
      expect(await everywhere()).toEqual(Array(4).fill(ids(seeded)))

      await reconcileBarPlans()

      const stillOn = ids([live, pastDue, onStripe])
      expect(await everywhere()).toEqual(Array(4).fill(stillOn))
      expect(
        (await refusal(live.fan.pubs.getById({ id: expired.barId }))).code
      ).toBe('NOT_FOUND')
      // O dono continua abrindo a prévia do próprio perfil.
      expect(
        (await expired.owner.pubs.getById({ id: expired.barId })).isActive
      ).toBe(false)
      for (const context of [live, pastDue, onStripe]) {
        expect((await live.fan.pubs.getById({ id: context.barId })).id).toBe(
          context.barId
        )
      }
      // Destaques filtram por `is_active` e `plan = 'elite'`. Conferido na
      // linha: a consulta tem uma entrada de cache só, de 60 s, que outro
      // arquivo da suíte já pode ter preenchido.
      const rows = await db
        .select({ id: bar.id, isActive: bar.isActive, plan: bar.plan })
        .from(bar)
        .where(inArray(bar.id, ids(seeded)))
      expect(
        Object.fromEntries(
          rows.map((row) => [row.id, [row.isActive, row.plan]])
        )
      ).toEqual({
        [expired.barId]: [false, 'starter'],
        [live.barId]: [true, 'elite'],
        [pastDue.barId]: [true, 'starter'],
        [onStripe.barId]: [true, 'starter']
      })

      // Contratar põe o bar de volta no ar, pelo webhook do Stripe.
      const [owner] = await db
        .select({ userId: bar.userId })
        .from(bar)
        .where(eq(bar.id, expired.barId))
      await applyStripeSubscription({
        id: `sub_${expired.barId}`,
        status: 'active',
        cancel_at: null,
        cancel_at_period_end: false,
        customer: `cus_${expired.barId}`,
        metadata: { userId: owner?.userId },
        discounts: [],
        items: {
          data: [
            {
              current_period_end: Math.floor(inAMonth().getTime() / 1000),
              price: { id: 'price_web357', lookup_key: 'pro_monthly' }
            }
          ]
        }
      } as unknown as Parameters<typeof applyStripeSubscription>[0])
      expect(await everywhere()).toEqual(Array(4).fill(ids(seeded)))
      expect((await live.fan.pubs.getById({ id: expired.barId })).plan).toBe(
        'pro'
      )

      // Com assinatura no Stripe o cron não desliga de novo.
      await reconcileBarPlans()
      expect(await search()).toEqual(ids(seeded))
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await resetAppConfig('rating.public_display')
      for (const context of seeded) await context.cleanup()
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

integrationTest(
  'bar sem assinatura conta como starter no caminho linear da busca',
  async () => {
    const result = await db.execute(
      sql`SELECT subscription_current_plan(NULL, NULL, NULL) AS plan`
    )
    expect(result.rows[0]?.plan).toBe('starter')
  }
)
