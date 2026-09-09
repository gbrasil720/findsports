import { db, eq, sql } from '@findsports_oficial/db'
import type { SubscriptionPlan } from '@findsports_oficial/db/schema/platform'
import { supportRequest } from '@findsports_oficial/db/schema/support'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, protectedProcedure, router } from '../index'
import {
  getSupportQueueUrl,
  sendSupportRequestEmail
} from '../lib/support-email'
import {
  deriveSupportPriority,
  type SupportPriority
} from '../lib/support-priority'

const categorySchema = z.enum([
  'account',
  'billing',
  'profile',
  'events',
  'other'
])
const statusSchema = z.enum(['open', 'in_progress', 'resolved'])

const effectivePlanSql = sql`
	CASE
		WHEN s.status = 'active'::subscription_status
			THEN COALESCE(s.plan, 'starter'::subscription_plan)
		WHEN s.status = 'trialing'::subscription_status
			AND s.current_period_end > NOW()
			THEN COALESCE(s.plan, 'starter'::subscription_plan)
		ELSE 'starter'::subscription_plan
	END
`
const prioritySql = sql`
	CASE ${effectivePlanSql}
		WHEN 'elite'::subscription_plan THEN 'highest'
		WHEN 'pro'::subscription_plan THEN 'priority'
		ELSE 'standard'
	END
`
const priorityRankSql = sql`
	CASE ${effectivePlanSql}
		WHEN 'elite'::subscription_plan THEN 0
		WHEN 'pro'::subscription_plan THEN 1
		ELSE 2
	END
`

type SupportPlan = {
  barId: string
  barName: string
  barEmail: string
  plan: SubscriptionPlan
}

async function getPubBar(userId: string): Promise<SupportPlan> {
  const result = await db.execute(sql`
		SELECT
			b.id AS "barId",
			b.name AS "barName",
			u.email AS "barEmail",
			${effectivePlanSql} AS plan
		FROM bar b
		JOIN "user" u ON u.id = b.user_id
		LEFT JOIN subscription s ON s.bar_id = b.id
		WHERE b.user_id = ${userId}
		LIMIT 1
	`)
  const row = result.rows[0] as
    | {
        barId: string
        barName: string
        barEmail: string
        plan: SubscriptionPlan
      }
    | undefined

  if (!row) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado para este usuário.'
    })
  }

  return row
}

function assertPub(role: string): void {
  if (role !== 'pub') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Apenas contas de bar podem acessar este recurso.'
    })
  }
}

type SupportRow = {
  id: string
  subject: string
  category: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  plan: SubscriptionPlan
  priority: SupportPriority
  createdAt: Date | string
  updatedAt: Date | string
}

type QueueRow = SupportRow & {
  barId: string
  barName: string
  barEmail: string
}

export const supportRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        subject: z.string().trim().min(3).max(120),
        category: categorySchema,
        description: z.string().trim().min(10).max(4000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertPub(ctx.session.user.role)
      const account = await getPubBar(ctx.session.user.id)
      const [created] = await db
        .insert(supportRequest)
        .values({
          barId: account.barId,
          subject: input.subject,
          category: input.category,
          description: input.description
        })
        .returning({
          id: supportRequest.id,
          status: supportRequest.status,
          createdAt: supportRequest.createdAt,
          updatedAt: supportRequest.updatedAt
        })

      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Não foi possível registrar a solicitação.'
        })
      }

      const priority = deriveSupportPriority(account.plan)
      let notificationDelivered = false
      try {
        const notification = await sendSupportRequestEmail({
          id: created.id,
          barName: account.barName,
          barEmail: account.barEmail,
          plan: account.plan,
          priority,
          category: input.category,
          subject: input.subject,
          description: input.description,
          url: getSupportQueueUrl(
            process.env.PUBLIC_APP_URL,
            env.BETTER_AUTH_URL
          )
        })
        notificationDelivered = notification.delivered
      } catch (error) {
        console.error('[support] solicitação criada sem notificação', error)
      }

      return {
        ...created,
        plan: account.plan,
        priority,
        notificationDelivered
      }
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    assertPub(ctx.session.user.role)
    const account = await getPubBar(ctx.session.user.id)
    const result = await db.execute(sql`
				SELECT
					r.id,
					r.subject,
					r.category,
					r.description,
					r.status,
					r.created_at AS "createdAt",
					r.updated_at AS "updatedAt",
					${effectivePlanSql} AS plan,
					${prioritySql} AS priority
				FROM support_request r
				LEFT JOIN subscription s ON s.bar_id = r.bar_id
				WHERE r.bar_id = ${account.barId}
				ORDER BY r.created_at DESC, r.id DESC
			`)

    return result.rows as SupportRow[]
  }),

  listQueue: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ input }) => {
      const result = await db.execute(sql`
				SELECT
					r.id,
					r.subject,
					r.category,
					r.description,
					r.status,
					r.created_at AS "createdAt",
					r.updated_at AS "updatedAt",
					b.id AS "barId",
					b.name AS "barName",
					u.email AS "barEmail",
					${effectivePlanSql} AS plan,
					${prioritySql} AS priority
				FROM support_request r
				JOIN bar b ON b.id = r.bar_id
				JOIN "user" u ON u.id = b.user_id
				LEFT JOIN subscription s ON s.bar_id = b.id
				ORDER BY ${priorityRankSql}, r.created_at ASC, r.id ASC
				LIMIT ${input.limit}
			`)

      return result.rows as QueueRow[]
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: statusSchema
      })
    )
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(supportRequest)
        .set({ status: input.status })
        .where(eq(supportRequest.id, input.id))
        .returning({
          id: supportRequest.id,
          status: supportRequest.status,
          updatedAt: supportRequest.updatedAt
        })

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Solicitação de suporte não encontrada.'
        })
      }

      return updated
    })
})
