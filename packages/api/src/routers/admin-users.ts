import { auth } from '@findsports_oficial/auth'
import {
  and,
  count,
  db,
  eq,
  gte,
  isNull,
  or,
  sql
} from '@findsports_oficial/db'
import {
  type AdminActionKind,
  recordAdminAction
} from '@findsports_oficial/db/admin-action'
import { session, user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { getCurrentPlan } from '../lib/current-plan'
import { escapeLike } from '../lib/escape-like'

const LIMIT = 200

const userIdInput = z.object({ userId: z.string().min(1).max(255) })

/**
 * Destinos dos links, os mesmos que o app manda: o reenvio de
 * `/verify-email` e o pedido de `/forgot-password`. Sem eles o better-auth
 * leva quem clica para `/`.
 */
const VERIFY_CALLBACK = '/verify-email?confirmed=1'
const RESET_REDIRECT = '/reset-password'

async function findTarget(userId: string) {
  const [target] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified
    })
    .from(user)
    .where(eq(user.id, userId))
  if (!target) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Essa pessoa não existe.'
    })
  }
  return target
}

/**
 * WEB-392: e-mail que o admin manda em nome da pessoa. Pelo `auth.api`, que
 * não passa pelo Turnstile nem pelo rate limit do HTTP. O registro e o pedido
 * ficam na mesma transação: se o better-auth recusar o pedido, nada é escrito.
 * O envio em si sai em segundo plano (`backgroundTasks`), e a falha da API de e-mail
 * fica só no log — por isso o Grimório e a tela dizem "pediu", não "enviou".
 */
async function sendOnBehalf(
  kind: AdminActionKind,
  actor: { id: string; name: string },
  target: { id: string; email: string },
  send: () => Promise<unknown>
) {
  await db.transaction(async (tx) => {
    await recordAdminAction(
      {
        kind,
        actorId: actor.id,
        actorName: actor.name,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.email
      },
      tx
    )
    await send()
  })
  return { email: target.email }
}

/**
 * WEB-193: a gestão de usuários (hoje Pessoas, `/houdini/pessoas`) buscava
 * os 200 mais novos pelo
 * `admin.listUsers` do better-auth e filtrava no navegador — conta mais antiga
 * não aparecia nem pelo e-mail exato. A busca e o papel vão para o WHERE e o
 * corte de 200 vem depois deles. Aqui e não no `listUsers`: ele busca um campo
 * por vez e com LIKE sensível a caixa, e a tela busca nome OU e-mail.
 */
export const adminUsersRouter = router({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().trim().max(255).optional(),
        role: z.enum(['fan', 'pub', 'admin']).optional()
      })
    )
    .query(async ({ input }) => {
      const pattern = input.search ? `%${escapeLike(input.search)}%` : null
      const where = and(
        input.role ? eq(user.role, input.role) : undefined,
        pattern
          ? or(
              sql`${user.name} ILIKE ${pattern} ESCAPE '\\'`,
              sql`${user.email} ILIKE ${pattern} ESCAPE '\\'`,
              // O ⌘K abre a ficha pelo id (`/houdini/pessoas?pessoa=…`).
              eq(user.id, input.search ?? '')
            )
          : undefined
      )
      const [users, [matched], [counts]] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            banned: user.banned,
            banReason: user.banReason,
            createdAt: user.createdAt,
            twoFactorEnabled: user.twoFactorEnabled,
            cityName: user.searchCityName,
            cityUf: user.searchCityUf
          })
          .from(user)
          .where(where)
          .orderBy(sql`${user.createdAt} DESC, ${user.id} DESC`)
          .limit(LIMIT),
        db.select({ n: count() }).from(user).where(where),
        // Contadores do topo são da base inteira, não da busca.
        db
          .select({
            total: count(),
            admins: sql<number>`count(*) FILTER (WHERE ${user.role} = 'admin')::int`,
            banned: sql<number>`count(*) FILTER (WHERE ${user.banned})::int`
          })
          .from(user)
      ])
      return { users, matched: matched?.n ?? 0, ...counts }
    }),

  /** Ficha da pessoa. O Grimório dela vem de `grimorio.list` por alvo. */
  ficha: adminProcedure.input(userIdInput).query(async ({ input }) => {
    const [account] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        twoFactorEnabled: user.twoFactorEnabled,
        onboardingCompleted: user.onboardingCompleted
      })
      .from(user)
      .where(eq(user.id, input.userId))
    if (!account) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Essa pessoa não existe.'
      })
    }
    const now = new Date()
    const [[ownerBar], [sessions]] = await Promise.all([
      db
        .select({
          id: bar.id,
          name: bar.name,
          isActive: bar.isActive,
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd
          }
        })
        .from(bar)
        .leftJoin(subscription, eq(subscription.barId, bar.id))
        .where(eq(bar.userId, account.id))
        .limit(1),
      // Só as sessões da própria pessoa: a de quem entrou na pele também é
      // dela no banco, mas não diz quando ela usou o app.
      db
        .select({
          active: count(),
          lastUsedAt: sql<Date | null>`max(${session.updatedAt})`.mapWith(
            session.updatedAt
          )
        })
        .from(session)
        .where(
          and(
            eq(session.userId, account.id),
            gte(session.expiresAt, now),
            isNull(session.impersonatedBy)
          )
        )
    ])
    return {
      account,
      bar: ownerBar
        ? {
            id: ownerBar.id,
            name: ownerBar.name,
            isActive: ownerBar.isActive,
            currentPlan: getCurrentPlan(ownerBar.subscription, now)
          }
        : null,
      sessions: {
        active: sessions?.active ?? 0,
        lastUsedAt: sessions?.lastUsedAt ?? null
      }
    }
  }),

  resendVerification: adminProcedure
    .input(userIdInput)
    .mutation(async ({ ctx, input }) => {
      const target = await findTarget(input.userId)
      // O better-auth calaria (responde 200 sem mandar nada); a recusa
      // explícita é para o admin não achar que o e-mail saiu.
      if (target.emailVerified) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'O e-mail dessa pessoa já está verificado.'
        })
      }
      return sendOnBehalf(
        'user.resend_verification',
        ctx.session.user,
        target,
        () =>
          auth.api.sendVerificationEmail({
            body: { email: target.email, callbackURL: VERIFY_CALLBACK }
          })
      )
    }),

  sendPasswordReset: adminProcedure
    .input(userIdInput)
    .mutation(async ({ ctx, input }) => {
      const target = await findTarget(input.userId)
      return sendOnBehalf(
        'user.send_password_reset',
        ctx.session.user,
        target,
        () =>
          auth.api.requestPasswordReset({
            body: { email: target.email, redirectTo: RESET_REDIRECT }
          })
      )
    })
})
