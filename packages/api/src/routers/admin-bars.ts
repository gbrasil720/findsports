import { count, db, eq, or, sql } from '@findsports_oficial/db'
import { stripeSubscription, user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { getCurrentPlan, getSubscriptionStanding } from '../lib/current-plan'
import { escapeLike } from '../lib/escape-like'

const PAGE_SIZE = 25

/**
 * Link da assinatura no dashboard do Stripe. O modo (teste ou vivo) vem do
 * prefixo da chave do ambiente; só o link sai daqui, nunca a chave.
 */
export function stripeSubscriptionUrl(
  subscriptionId: string,
  secretKey = env.STRIPE_SECRET_KEY
) {
  const mode = /^(sk|rk)_live_/.test(secretKey ?? '') ? '' : 'test/'
  return `https://dashboard.stripe.com/${mode}subscriptions/${encodeURIComponent(subscriptionId)}`
}

/**
 * WEB-354: `/internal/bars`. Plano, situação e assinatura de um bar só saíam
 * por SQL no banco. Só leitura: estender trial e despublicar ficam para depois.
 */
export const adminBarsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().trim().max(255).optional(),
        page: z.number().int().min(1).max(10_000).default(1)
      })
    )
    .query(async ({ input }) => {
      const search = input.search
      const pattern = search ? `%${escapeLike(search)}%` : null
      const where =
        search && pattern
          ? or(
              sql`${bar.name} ILIKE ${pattern} ESCAPE '\\'`,
              sql`${user.email} ILIKE ${pattern} ESCAPE '\\'`,
              eq(bar.id, search),
              eq(bar.userId, search)
            )
          : undefined
      const [rows, [matched]] = await Promise.all([
        db
          .select({
            id: bar.id,
            name: bar.name,
            isActive: bar.isActive,
            barPlan: bar.plan,
            createdAt: bar.createdAt,
            ownerName: user.name,
            ownerEmail: user.email,
            subscription: {
              plan: subscription.plan,
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              provider: subscription.provider,
              externalSubscriptionId: subscription.externalSubscriptionId
            },
            // `stripe_subscription` é do plugin e só é lida aqui, no painel
            // interno. Subconsulta em vez de join: `stripe_subscription_id`
            // não é único lá, e linha repetida duplicaria o bar na página.
            cancelAt: sql<Date | null>`(
              SELECT max(${stripeSubscription.cancelAt})
              FROM ${stripeSubscription}
              WHERE ${stripeSubscription.stripeSubscriptionId} = ${subscription.externalSubscriptionId}
            )`.mapWith(stripeSubscription.cancelAt),
            upcomingGames: sql<number>`(
              SELECT count(*)::int FROM ${event}
              WHERE ${event.barId} = ${bar.id} AND ${event.startsAt} > now()
            )`
          })
          .from(bar)
          .innerJoin(user, eq(user.id, bar.userId))
          .leftJoin(subscription, eq(subscription.barId, bar.id))
          .where(where)
          .orderBy(sql`${bar.createdAt} DESC, ${bar.id} DESC`)
          .limit(PAGE_SIZE)
          .offset((input.page - 1) * PAGE_SIZE),
        db
          .select({ n: count() })
          .from(bar)
          .innerJoin(user, eq(user.id, bar.userId))
          .where(where)
      ])
      const now = new Date()
      return {
        bars: rows.map((row) => ({
          ...row,
          // Mesma regra que decide recurso pago; `barPlan` é a projeção da
          // busca e pode atrasar até um dia (`reconcileBarPlans`).
          currentPlan: getCurrentPlan(row.subscription, now),
          standing: getSubscriptionStanding(row.subscription, now),
          stripeUrl:
            row.subscription?.provider === 'stripe' &&
            row.subscription.externalSubscriptionId
              ? stripeSubscriptionUrl(row.subscription.externalSubscriptionId)
              : null
        })),
        matched: matched?.n ?? 0,
        pageSize: PAGE_SIZE
      }
    })
})
