import {
  and,
  count,
  db,
  eq,
  inArray,
  isNull,
  or,
  sql
} from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import { stripeSubscription, user } from '@findsports_oficial/db/schema/auth'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import {
  bar,
  event,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { reservation } from '@findsports_oficial/db/schema/reservation'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { getCurrentPlan, getSubscriptionStanding } from '../lib/current-plan'
import { escapeLike } from '../lib/escape-like'
import { gameTitle } from '../lib/game-participants'

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
 * O que a busca deveria ter em `bar.plan`: a função do banco que a trigger e
 * a reconciliação diária usam (migration 0050). Bar sem assinatura cai em
 * `starter`, como na trigger.
 */
const expectedSearchPlan = sql<
  typeof bar.$inferSelect.plan
>`subscription_current_plan(${subscription.plan}, ${subscription.status}, ${subscription.currentPeriodEnd})`

/**
 * Teste vencido, na comparação de `subscription_current_plan`: `timestamp`
 * sem fuso lido como UTC, contra o relógio do banco.
 */
const trialExpired = sql<boolean>`(${subscription.currentPeriodEnd} IS NULL OR ${subscription.currentPeriodEnd} <= (now() AT TIME ZONE 'UTC'))`

const barInput = z.object({ barId: z.string().min(1).max(255) })

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A última decisão de admin sobre o bar estar no ar, pelo Grimório. Bar tirado
 * do ar de propósito não volta ao ar por tabela (estender o teste).
 */
async function takenOffAirByAdmin(tx: Tx, barId: string) {
  const [last] = await tx
    .select({ kind: adminAction.kind })
    .from(adminAction)
    .where(
      and(
        eq(adminAction.targetType, 'bar'),
        eq(adminAction.targetId, barId),
        inArray(adminAction.kind, ['bar.take_off_air', 'bar.put_on_air'])
      )
    )
    .orderBy(sql`${adminAction.createdAt} DESC`)
    .limit(1)
  return last?.kind === 'bar.take_off_air'
}

/** O bar e a assinatura, com o bar travado até o fim da transação. */
async function lockBar(tx: Tx, barId: string) {
  const [row] = await tx
    .select({
      name: bar.name,
      isActive: bar.isActive,
      barPlan: bar.plan,
      expectedSearchPlan,
      status: subscription.status,
      externalSubscriptionId: subscription.externalSubscriptionId,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialExpired
    })
    .from(bar)
    .leftJoin(subscription, eq(subscription.barId, bar.id))
    .where(eq(bar.id, barId))
    .for('update', { of: bar })
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bar não encontrado.' })
  }
  return {
    ...row,
    // O teste do cadastro: sem assinatura no Stripe (WEB-357/358).
    signupTrial: row.status === 'trialing' && !row.externalSubscriptionId
  }
}

function actor(ctx: { session: { user: { id: string; name: string } } }) {
  return { actorId: ctx.session.user.id, actorName: ctx.session.user.name }
}

/**
 * WEB-354: a tela Bares do Houdini (`/houdini/bares`). Plano, situação e
 * assinatura de um bar só saíam
 * por SQL no banco. WEB-385: os truques que antes só se faziam no banco
 * (busca atrasada, teste vencido, bar fora do ar), cada um escrito no
 * Grimório na mesma transação.
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
            expectedSearchPlan,
            createdAt: bar.createdAt,
            ownerId: user.id,
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
    }),

  /**
   * "Arrumar agora": a regra da reconciliação diária (`reconcileBarPlans`),
   * só neste bar. Sem diferença, nada é gravado.
   */
  syncSearchPlan: adminProcedure.input(barInput).mutation(({ ctx, input }) =>
    db.transaction(async (tx) => {
      const found = await lockBar(tx, input.barId)
      const before = found.barPlan
      const after = found.expectedSearchPlan
      if (before === after) return { before, after, changed: false }
      await tx.update(bar).set({ plan: after }).where(eq(bar.id, input.barId))
      await recordAdminAction(
        {
          kind: 'bar.sync_search',
          ...actor(ctx),
          targetType: 'bar',
          targetId: input.barId,
          targetLabel: found.name,
          before: { plan: before },
          after: { plan: after }
        },
        tx
      )
      return { before, after, changed: true }
    })
  ),

  /**
   * Mais dias no teste grátis do cadastro, contados do fim atual ou de agora,
   * o que vier depois. Assinatura no Stripe fica de fora: lá o período é do
   * Stripe, e o próximo evento reescreveria a data. A trigger
   * `subscription_bar_plan_sync` põe `bar.plan` em dia na mesma escrita.
   *
   * Teste vencido com o bar fora do ar é o desligamento da reconciliação
   * (WEB-357): o bar volta ao ar. Bar tirado do ar com o teste ainda valendo
   * foi decisão de alguém, e continua fora.
   */
  extendTrial: adminProcedure
    .input(
      barInput.extend({
        days: z.union([z.literal(7), z.literal(14), z.literal(30)])
      })
    )
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const found = await lockBar(tx, input.barId)
        if (found.externalSubscriptionId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Este bar assina pelo Stripe: o fim do período é do Stripe, não dá para estender por aqui.'
          })
        }
        if (!found.signupTrial) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Só o teste grátis do cadastro pode ser estendido.'
          })
        }
        const [extended] = await tx
          .update(subscription)
          .set({
            currentPeriodEnd: sql`GREATEST(${subscription.currentPeriodEnd}, now() AT TIME ZONE 'UTC') + make_interval(days => ${input.days})`
          })
          .where(
            and(
              eq(subscription.barId, input.barId),
              eq(subscription.status, 'trialing'),
              isNull(subscription.externalSubscriptionId)
            )
          )
          .returning({ currentPeriodEnd: subscription.currentPeriodEnd })
        if (!extended) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'A assinatura mudou agora há pouco. Recarregue e tente de novo.'
          })
        }
        // Religa quem saiu do ar porque o teste venceu, não quem um admin
        // tirou do ar de propósito.
        const isActive =
          found.isActive ||
          (found.trialExpired && !(await takenOffAirByAdmin(tx, input.barId)))
        if (isActive !== found.isActive) {
          await tx
            .update(bar)
            .set({ isActive: true })
            .where(eq(bar.id, input.barId))
        }
        await recordAdminAction(
          {
            kind: 'bar.extend_trial',
            ...actor(ctx),
            targetType: 'bar',
            targetId: input.barId,
            targetLabel: found.name,
            before: {
              currentPeriodEnd: found.currentPeriodEnd,
              isActive: found.isActive
            },
            after: { currentPeriodEnd: extended.currentPeriodEnd, isActive },
            detail: { days: input.days }
          },
          tx
        )
        return { currentPeriodEnd: extended.currentPeriodEnd, isActive }
      })
    ),

  /**
   * Tirar do ar e religar. Religar com o teste do cadastro vencido seria
   * desfeito pela reconciliação do dia seguinte: o caminho é estender.
   */
  setActive: adminProcedure
    .input(barInput.extend({ active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const found = await lockBar(tx, input.barId)
        if (found.isActive === input.active) {
          return { isActive: input.active, changed: false }
        }
        // `applyStripeSubscription` religa o bar a cada evento do Stripe:
        // tirar do ar por aqui duraria até a próxima renovação.
        if (!input.active && found.externalSubscriptionId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Este bar assina pelo Stripe e voltaria ao ar no próximo evento da assinatura. Para tirá-lo do ar, cancele a assinatura no Stripe.'
          })
        }
        if (input.active && found.signupTrial && found.trialExpired) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'O teste do cadastro venceu: a reconciliação diária tiraria o bar do ar de novo. Estenda o teste.'
          })
        }
        await tx
          .update(bar)
          .set({ isActive: input.active })
          .where(eq(bar.id, input.barId))
        await recordAdminAction(
          {
            kind: input.active ? 'bar.put_on_air' : 'bar.take_off_air',
            ...actor(ctx),
            targetType: 'bar',
            targetId: input.barId,
            targetLabel: found.name,
            before: { isActive: found.isActive },
            after: { isActive: input.active }
          },
          tx
        )
        return { isActive: input.active, changed: true }
      })
    ),

  /** A ficha completa de um bar no Houdini. Só leitura. */
  ficha: adminProcedure.input(barInput).query(async ({ input }) => {
    const [row] = await db
      .select({
        id: bar.id,
        name: bar.name,
        neighborhood: bar.neighborhood,
        city: bar.city,
        uf: bar.uf,
        phone: bar.phone,
        ownerId: bar.userId,
        isActive: bar.isActive,
        barPlan: bar.plan,
        expectedSearchPlan,
        createdAt: bar.createdAt,
        ratingCount: bar.ratingCount,
        ratingPositive: bar.ratingPositive,
        owner: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          banned: user.banned,
          stripeCustomerId: user.stripeCustomerId
        },
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          provider: subscription.provider,
          externalSubscriptionId: subscription.externalSubscriptionId,
          cancelAt: subscription.cancelAt
        }
      })
      .from(bar)
      .innerJoin(user, eq(user.id, bar.userId))
      .leftJoin(subscription, eq(subscription.barId, bar.id))
      .where(eq(bar.id, input.barId))
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Bar não encontrado.' })
    }

    const title = gameTitle({
      id: sql`${event.id}`,
      participantFreeText: sql`${event.participantFreeText}`,
      championship: sql`${event.championship}`
    })
    // Reserva que ocupa lugar, como na lotação (WEB-152).
    const seated = sql`${reservation.status} IN ('pending', 'confirmed')`
    // ponytail: listas com teto fixo, sem paginação; paginar quando um bar passar disso.
    const [games, reservations, ratings, grimorio, [recent]] =
      await Promise.all([
        db
          .select({
            id: event.id,
            title,
            championship: event.championship,
            startsAt: event.startsAt,
            acceptsReservations: event.acceptsReservations,
            reservationCap: sql<
              number | null
            >`COALESCE(${event.reservationCap}, ${bar.reservationCap})`,
            reservations: sql<number>`(
              SELECT count(*)::int FROM ${reservation}
              WHERE ${reservation.eventId} = ${event.id} AND ${seated}
            )`,
            people: sql<number>`(
              SELECT COALESCE(sum(${reservation.partySize}), 0)::int
              FROM ${reservation}
              WHERE ${reservation.eventId} = ${event.id} AND ${seated}
            )`
          })
          .from(event)
          .innerJoin(bar, eq(bar.id, event.barId))
          .where(
            and(eq(event.barId, input.barId), sql`${event.startsAt} > now()`)
          )
          .orderBy(event.startsAt)
          .limit(100),
        db
          .select({
            id: reservation.id,
            guestName: user.name,
            partySize: reservation.partySize,
            status: reservation.status,
            createdAt: reservation.createdAt,
            gameTitle: title,
            startsAt: event.startsAt
          })
          .from(reservation)
          .innerJoin(event, eq(event.id, reservation.eventId))
          .innerJoin(user, eq(user.id, reservation.userId))
          .where(eq(event.barId, input.barId))
          .orderBy(sql`${reservation.createdAt} DESC`)
          .limit(50),
        db
          .select({
            id: barRating.id,
            wouldReturn: barRating.wouldReturn,
            createdAt: barRating.createdAt,
            fanName: user.name,
            gameTitle: title
          })
          .from(barRating)
          .innerJoin(event, eq(event.id, barRating.eventId))
          .innerJoin(user, eq(user.id, barRating.actorUserId))
          .where(eq(barRating.barId, input.barId))
          .orderBy(sql`${barRating.createdAt} DESC`)
          .limit(50),
        // O bar e o dono: entrar na pele do dono também é truque sobre o bar.
        db
          .select()
          .from(adminAction)
          .where(
            or(
              and(
                eq(adminAction.targetType, 'bar'),
                eq(adminAction.targetId, input.barId)
              ),
              and(
                eq(adminAction.targetType, 'user'),
                eq(adminAction.targetId, row.owner.id)
              )
            )
          )
          .orderBy(sql`${adminAction.createdAt} DESC, ${adminAction.id} DESC`)
          .limit(50),
        db
          .select({
            n: sql<number>`count(*)::int`,
            people: sql<number>`COALESCE(sum(${reservation.partySize}), 0)::int`
          })
          .from(reservation)
          .innerJoin(event, eq(event.id, reservation.eventId))
          .where(
            and(
              eq(event.barId, input.barId),
              seated,
              sql`${reservation.createdAt} > now() - interval '30 days'`
            )
          )
      ])

    const sub = row.subscription
    const now = new Date()
    return {
      ...row,
      currentPlan: getCurrentPlan(sub, now),
      standing: getSubscriptionStanding(sub, now),
      stripeUrl:
        sub?.provider === 'stripe' && sub.externalSubscriptionId
          ? stripeSubscriptionUrl(sub.externalSubscriptionId)
          : null,
      games,
      reservations,
      reservations30d: recent ?? { n: 0, people: 0 },
      ratings,
      grimorio
    }
  })
})
