import {
  and,
  count,
  db,
  eq,
  isNull,
  or,
  type SQL,
  sql
} from '@findsports_oficial/db'
import {
  brasiliaDaySql,
  brasiliaDayStartSql,
  brasiliaTodaySql,
  utcNowSql
} from '@findsports_oficial/db/event-window-sql'
import { user } from '@findsports_oficial/db/schema/auth'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import {
  bar,
  event,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { readUnregisteredAlerts } from '../lib/attendance'
import { getCurrentPlan } from '../lib/current-plan'
import { escapeLike } from '../lib/escape-like'
import { houdiniIaRouter } from './houdini-ia'

const DAY = 24 * 3_600_000
const SEARCH_LIMIT = 8

/** Quantas linhas passam no filtro, como inteiro (o `count` é bigint). */
const tally = (where: SQL | undefined) =>
  sql<number>`(count(*) filter (where ${where}))::int`

// As colunas são `timestamp` sem fuso, em UTC. O ISO com `Z` vira esse mesmo
// instante: o Postgres descarta o fuso ao converter para `timestamp`.
const iso = (date: Date) => date.toISOString()

// Teste do cadastro: `trialing` sem assinatura no Stripe. É o que a
// reconciliação diária tira do ar quando vence (WEB-357).
const signupTrial = and(
  eq(subscription.status, 'trialing'),
  isNull(subscription.externalSubscriptionId)
)

/**
 * Teste do cadastro que acaba até o fim do sexto dia depois de hoje, no
 * horário de Brasília: as sete colunas da Ampulheta, e o cartão do Início
 * conta o mesmo. Entra também o que já venceu e segue no ar à espera da
 * reconciliação (sem data conta como vencido, como lá): a coluna de hoje.
 */
const trialEndingThisWeek = and(
  signupTrial,
  sql`(${subscription.currentPeriodEnd} IS NULL OR ${subscription.currentPeriodEnd} < ${brasiliaDayStartSql(brasiliaTodaySql(), 7)})`
)

/** Dias entre hoje e o fim do teste, contados no calendário de Brasília. */
const spDaysUntilEnd = sql<number>`(${brasiliaDaySql(subscription.currentPeriodEnd)} - ${brasiliaTodaySql()})`

const upcomingGames = sql<number>`(
  SELECT count(*)::int FROM ${event}
  WHERE ${event.barId} = ${bar.id} AND ${event.startsAt} > ${utcNowSql()}
    AND ${event.publishedAt} IS NOT NULL
)`

// ponytail: teto fixo nas listas da Ampulheta; paginar se passar disso.
const AMPULHETA_LIMIT = 200

/**
 * WEB-391: o Início do Houdini e o ⌘K. Só leitura, montado com o que as
 * tabelas já registram.
 */
export const houdiniRouter = router({
  /** A tela "IA": testes, gasto e limites da IA. */
  ia: houdiniIaRouter,

  overview: adminProcedure.query(async () => {
    const now = new Date()
    const [[people], [bars], ghosts] = await Promise.all([
      db
        .select({
          total: count(),
          novas: tally(
            sql`${user.createdAt} > ${iso(new Date(now.getTime() - DAY))}`
          )
        })
        .from(user),
      db
        .select({
          noAr: count(),
          // Mesmos dois ramos de `getCurrentPlan`: `active` dá o plano, e
          // `trialing` só enquanto o período não venceu.
          emTeste: tally(
            and(
              eq(subscription.status, 'trialing'),
              sql`${subscription.currentPeriodEnd} > ${iso(now)}`
            )
          ),
          pagando: tally(eq(subscription.status, 'active')),
          testesAcabando: tally(trialEndingThisWeek)
        })
        .from(bar)
        .leftJoin(subscription, eq(subscription.barId, bar.id))
        .where(eq(bar.isActive, true)),
      readUnregisteredAlerts()
    ])
    return {
      people: { total: people?.total ?? 0, novas: people?.novas ?? 0 },
      bars: {
        noAr: bars?.noAr ?? 0,
        emTeste: bars?.emTeste ?? 0,
        pagando: bars?.pagando ?? 0
      },
      testesAcabando: bars?.testesAcabando ?? 0,
      fantasmas: ghosts.length
    }
  }),

  /**
   * WEB-386: a Ampulheta. `ending` são os bares no ar cujo teste do cadastro
   * acaba nesta semana, com o dia (0 = hoje, no calendário de Brasília).
   *
   * `gone` são os que estão fora do ar com o teste vencido nos últimos 7 dias.
   * A reconciliação não anota quais bares desligou (o `job_run` guarda só a
   * contagem), então a data é a do fim do teste: o bar saiu na execução
   * seguinte, até um dia depois. Fica de fora o bar que um admin tirou do ar
   * (o último liga/desliga dele no Grimório é desligar): religar ali
   * desfaria uma decisão, não um vencimento.
   */
  ampulheta: adminProcedure.query(async () => {
    const lastOnOff = sql`(
      SELECT ${adminAction.kind} FROM ${adminAction}
      WHERE ${adminAction.targetType} = 'bar'
        AND ${adminAction.targetId} = ${bar.id}
        AND ${adminAction.kind} IN ('bar.take_off_air', 'bar.put_on_air')
      ORDER BY ${adminAction.createdAt} DESC
      LIMIT 1
    )`
    const columns = {
      id: bar.id,
      name: bar.name,
      plan: subscription.plan,
      currentPeriodEnd: subscription.currentPeriodEnd,
      upcomingGames
    }
    const [ending, gone] = await Promise.all([
      db
        .select({
          ...columns,
          status: subscription.status,
          day: sql<number>`GREATEST(0, COALESCE(${spDaysUntilEnd}, 0))`
        })
        .from(bar)
        .innerJoin(subscription, eq(subscription.barId, bar.id))
        .where(and(eq(bar.isActive, true), trialEndingThisWeek))
        .orderBy(sql`${subscription.currentPeriodEnd} ASC NULLS FIRST`)
        .limit(AMPULHETA_LIMIT),
      db
        .select({ ...columns, daysAgo: sql<number>`-${spDaysUntilEnd}` })
        .from(bar)
        .innerJoin(subscription, eq(subscription.barId, bar.id))
        .where(
          and(
            eq(bar.isActive, false),
            signupTrial,
            sql`${subscription.currentPeriodEnd} <= ${utcNowSql()}`,
            sql`${subscription.currentPeriodEnd} > ${utcNowSql()} - interval '7 days'`,
            sql`${lastOnOff} IS DISTINCT FROM 'bar.take_off_air'`
          )
        )
        .orderBy(sql`${subscription.currentPeriodEnd} DESC`)
        .limit(AMPULHETA_LIMIT)
    ])
    const now = new Date()
    return {
      // O plano do teste pela regra de recurso pago: o que já venceu e
      // espera a reconciliação aparece sem plano.
      ending: ending.map(({ status, ...row }) => ({
        ...row,
        currentPlan: getCurrentPlan({ ...row, status }, now)
      })),
      gone
    }
  }),

  /**
   * "Coelhos": o que entrou por último. Conta nova e bar novo vêm do
   * `created_at`; assinatura vem do `updated_at` de `subscription`, que o
   * webhook regrava a cada evento do Stripe (renovação inclusive) — por isso a
   * linha diz em que pé a assinatura está, não o que mudou. Fica de fora a
   * linha nascida no cadastro e nunca mexida: o "bar novo" já conta.
   */
  coelhos: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ input }) => {
      const [people, bars, subs] = await Promise.all([
        db
          .select({
            id: user.id,
            at: user.createdAt,
            name: user.name,
            role: user.role,
            cityName: user.searchCityName,
            cityUf: user.searchCityUf,
            radiusKm: user.searchRadiusKm
          })
          .from(user)
          .orderBy(sql`${user.createdAt} DESC`)
          .limit(input.limit),
        db
          .select({
            id: bar.id,
            at: bar.createdAt,
            name: bar.name,
            neighborhood: bar.neighborhood,
            city: bar.city
          })
          .from(bar)
          .orderBy(sql`${bar.createdAt} DESC`)
          .limit(input.limit),
        db
          .select({
            id: subscription.id,
            barId: subscription.barId,
            at: subscription.updatedAt,
            barName: bar.name,
            plan: subscription.plan,
            status: subscription.status,
            stripe: sql<boolean>`${subscription.externalSubscriptionId} IS NOT NULL`,
            currentPeriodEnd: subscription.currentPeriodEnd
          })
          .from(subscription)
          .innerJoin(bar, eq(bar.id, subscription.barId))
          .where(
            sql`${subscription.updatedAt} > ${subscription.createdAt} + interval '1 minute'`
          )
          .orderBy(sql`${subscription.updatedAt} DESC`)
          .limit(input.limit)
      ])
      return [
        ...people.map((p) => ({ type: 'person' as const, ...p })),
        ...bars.map((b) => ({ type: 'bar' as const, ...b })),
        ...subs.map((s) => ({ type: 'subscription' as const, ...s }))
      ]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, input.limit)
    }),

  /**
   * ⌘K: pessoa por nome, e-mail, id ou cliente do Stripe (`cus_…`, que o
   * plugin grava em `user.stripe_customer_id`); bar por nome, id ou pelo
   * cliente do dono.
   */
  search: adminProcedure
    .input(z.object({ q: z.string().trim().min(1).max(255) }))
    .query(async ({ input }) => {
      const pattern = `%${escapeLike(input.q)}%`
      const [people, bars] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          })
          .from(user)
          .where(
            or(
              sql`${user.name} ILIKE ${pattern} ESCAPE '\\'`,
              sql`${user.email} ILIKE ${pattern} ESCAPE '\\'`,
              eq(user.id, input.q),
              eq(user.stripeCustomerId, input.q)
            )
          )
          .orderBy(sql`${user.createdAt} DESC`)
          .limit(SEARCH_LIMIT),
        db
          .select({
            id: bar.id,
            name: bar.name,
            neighborhood: bar.neighborhood,
            city: bar.city
          })
          .from(bar)
          .innerJoin(user, eq(user.id, bar.userId))
          .where(
            or(
              sql`${bar.name} ILIKE ${pattern} ESCAPE '\\'`,
              eq(bar.id, input.q),
              eq(user.stripeCustomerId, input.q)
            )
          )
          .orderBy(sql`${bar.createdAt} DESC`)
          .limit(SEARCH_LIMIT)
      ])
      return { people, bars }
    })
})
