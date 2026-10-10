import { expect, test } from 'bun:test'
import { db, eq, sql } from '@findsports_oficial/db'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, seedBar } from '../routers/integration-seed'
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

integrationTest(
  'bar sem assinatura conta como starter no caminho linear da busca',
  async () => {
    const result = await db.execute(
      sql`SELECT subscription_current_plan(NULL, NULL, NULL) AS plan`
    )
    expect(result.rows[0]?.plan).toBe('starter')
  }
)
