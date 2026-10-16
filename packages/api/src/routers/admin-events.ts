import {
  and,
  count,
  db,
  eq,
  inArray,
  type SQL,
  sql
} from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH
} from '@findsports_oficial/db/event-limits'
import { DEFAULT_EVENT_DURATION_INTERVAL } from '@findsports_oficial/db/event-window'
import {
  bar,
  event,
  eventParticipants,
  team
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { escapeLike } from '../lib/escape-like'
import {
  getEventDeletionBlock,
  readEventDeletionImpact
} from '../lib/event-deletion'
import { gameTitle, participantNames } from '../lib/game-participants'
import { assertEventIntervalValid, assertEventStartInRange } from './pub'

const PAGE_SIZE = 25

type Team = { id: string; name: string }

const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** "Flamengo × Vasco", "Flamengo x Vasco", "Flamengo vs Vasco", "Flamengo - Vasco". */
const VERSUS = /\s+(?:×|x|vs\.?|versus|-|–|—)\s+/i

/**
 * O time do catálogo que o texto livre quis dizer, só quando não há dúvida:
 * cada lado casa, sem acento nem caixa, com exatamente um time do esporte do
 * jogo. "Fla", "Galo" ou dois times com o mesmo nome não sugerem nada.
 */
export function suggestTeams(freeText: string, teams: Team[]): Team[] | null {
  const parts = freeText.split(VERSUS).map(normalizeName).filter(Boolean)
  if (parts.length === 0 || parts.length > 2) return null
  const byName = new Map<string, Team[]>()
  for (const t of teams) {
    const key = normalizeName(t.name)
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  const picked: Team[] = []
  for (const part of parts) {
    const matches = byName.get(part) ?? []
    const [only] = matches
    if (matches.length !== 1 || !only) return null
    if (picked.some((t) => t.id === only.id)) return null
    picked.push(only)
  }
  return picked
}

/** Times do jogo como chave comparável; nulo quando o jogo não tem time. */
const teamKey = (eventId: SQL | typeof event.id) =>
  sql`(SELECT array_agg(ep.team_id ORDER BY ep.team_id) FROM event_participants ep WHERE ep.event_id = ${eventId})`

/**
 * Mesmo bar, mesmo início e mesmo confronto: mesmos times, ou o mesmo texto
 * livre. Olha a tabela inteira, não a página: o outro pode ter campeonato
 * escrito de outro jeito e ficar fora da busca.
 */
const isDuplicate = sql<boolean>`EXISTS (
  SELECT 1 FROM event o
  WHERE o.bar_id = ${event.barId}
    AND o.starts_at = ${event.startsAt}
    AND o.id <> ${event.id}
    AND (
      ${teamKey(sql`o.id`)} = ${teamKey(event.id)}
      OR lower(trim(o.participant_free_text)) = lower(trim(nullif(${event.participantFreeText}, '')))
    )
)`

/** Digitado à mão e sem time ligado: não aparece para quem segue o time. */
const isFreeText = sql<boolean>`(
  nullif(trim(${event.participantFreeText}), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = ${event.id})
)`

const hasWarning = sql`(${isDuplicate} OR ${isFreeText})`

/** O jogo que ainda não acabou, pelo fim derivado da ADR 0003. */
const notEnded = sql`coalesce(${event.endsAt}, ${event.startsAt} + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval) > now()`

// As colunas são `timestamp` em UTC; "hoje" é o dia em Brasília.
const PERIOD: Record<'today' | 'week' | 'all', SQL | undefined> = {
  today: sql`${event.startsAt} < ((((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`,
  week: sql`${event.startsAt} < (now() AT TIME ZONE 'UTC') + interval '7 days'`,
  all: undefined
}

const title = gameTitle({
  id: sql`${event.id}`,
  participantFreeText: sql`${event.participantFreeText}`,
  championship: sql`${event.championship}`
})

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Trava o jogo e devolve o que o Grimório e as regras precisam dele. */
async function lockEvent(tx: Executor, eventId: string) {
  const [row] = await tx
    .select({
      id: event.id,
      barId: event.barId,
      sportId: event.sportId,
      barName: bar.name,
      title,
      championship: event.championship,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      participantFreeText: event.participantFreeText,
      duplicate: isDuplicate,
      freeText: isFreeText
    })
    .from(event)
    .innerJoin(bar, eq(bar.id, event.barId))
    .where(eq(event.id, eventId))
    .for('update', { of: event })
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
  }
  return row
}

type LockedEvent = Awaited<ReturnType<typeof lockEvent>>

const snapshot = (row: LockedEvent) => ({
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt?.toISOString() ?? null,
  championship: row.championship
})

const target = (row: LockedEvent) => ({
  targetType: 'event',
  targetId: row.id,
  targetLabel: `${row.title} · ${row.barName}`
})

async function catalogFor(
  tx: Executor,
  sportIds: string[]
): Promise<(Team & { sportId: string })[]> {
  if (sportIds.length === 0) return []
  return tx
    .select({ id: team.id, name: team.name, sportId: team.sportId })
    .from(team)
    .where(inArray(team.sportId, [...new Set(sportIds)]))
}

/**
 * WEB-388: jogo cadastrado errado (horário trocado, duplicado, time digitado
 * à mão) só se corrigia no banco. Os avisos saem daqui, calculados no
 * servidor, e cada conserto confere de novo, travado, antes de mexer.
 */
export const adminEventsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        period: z.enum(['today', 'week', 'all']).default('week'),
        onlyWarnings: z.boolean().default(false),
        search: z.string().trim().max(255).optional(),
        page: z.number().int().min(1).max(10_000).default(1)
      })
    )
    .query(async ({ input }) => {
      const pattern = input.search ? `%${escapeLike(input.search)}%` : null
      const base = and(
        notEnded,
        PERIOD[input.period],
        pattern
          ? sql`(
              ${event.championship} ILIKE ${pattern} ESCAPE '\\'
              OR ${bar.name} ILIKE ${pattern} ESCAPE '\\'
              OR ${event.participantFreeText} ILIKE ${pattern} ESCAPE '\\'
              OR EXISTS (
                SELECT 1 FROM event_participants ep JOIN team t ON t.id = ep.team_id
                WHERE ep.event_id = ${event.id} AND t.name ILIKE ${pattern} ESCAPE '\\'
              )
            )`
          : undefined
      )
      const where = input.onlyWarnings ? and(base, hasWarning) : base

      const [rows, [totals]] = await Promise.all([
        db
          .select({
            id: event.id,
            barId: event.barId,
            barName: bar.name,
            sportId: event.sportId,
            championship: event.championship,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            participantFreeText: event.participantFreeText,
            participants: participantNames(sql`${event.id}`),
            // Códigos do balcão em vigor (quem marcou "Vou assistir aqui"
            // num bar Elite).
            codes: sql<number>`(
              SELECT count(*)::int FROM reservation r
              WHERE r.event_id = ${event.id} AND r.status = 'confirmed'
            )`,
            // Qualquer código, até o desmarcado: o duplicado só sai sozinho
            // quando não leva o histórico de ninguém junto.
            anyReservations: sql<number>`(
              SELECT count(*)::int FROM reservation r WHERE r.event_id = ${event.id}
            )`,
            duplicate: isDuplicate,
            freeText: isFreeText
          })
          .from(event)
          .innerJoin(bar, eq(bar.id, event.barId))
          .where(where)
          .orderBy(sql`${event.startsAt}, ${event.id}`)
          .limit(PAGE_SIZE)
          .offset((input.page - 1) * PAGE_SIZE),
        db
          .select({
            total: count(),
            warned: sql<number>`count(*) FILTER (WHERE ${hasWarning})::int`
          })
          .from(event)
          .innerJoin(bar, eq(bar.id, event.barId))
          .where(base)
      ])

      const catalog = await catalogFor(
        db,
        rows.filter((r) => r.freeText).map((r) => r.sportId)
      )

      return {
        games: rows.map(({ duplicate, freeText, ...row }) => {
          const warnings = []
          if (duplicate) {
            warnings.push({
              kind: 'duplicate' as const,
              canDelete: row.anyReservations === 0
            })
          }
          if (freeText && row.participantFreeText) {
            warnings.push({
              kind: 'free_text' as const,
              text: row.participantFreeText,
              suggestion:
                suggestTeams(
                  row.participantFreeText,
                  catalog.filter((t) => t.sportId === row.sportId)
                )?.map(({ id, name }) => ({ id, name })) ?? null
            })
          }
          return { ...row, warnings }
        }),
        total: totals?.total ?? 0,
        warned: totals?.warned ?? 0,
        matched: input.onlyWarnings
          ? (totals?.warned ?? 0)
          : (totals?.total ?? 0),
        pageSize: PAGE_SIZE
      }
    }),

  update: adminProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().nullable(),
        championship: z
          .string()
          .trim()
          .min(EVENT_CHAMPIONSHIP_MIN_LENGTH)
          .max(EVENT_CHAMPIONSHIP_MAX_LENGTH)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const startsAt = new Date(input.startsAt)
      const endsAt = input.endsAt ? new Date(input.endsAt) : null
      assertEventIntervalValid(startsAt, endsAt)

      return db.transaction(async (tx) => {
        const row = await lockEvent(tx, input.eventId)
        // A regra do painel do bar: o início só é conferido quando muda.
        if (startsAt.getTime() !== row.startsAt.getTime()) {
          assertEventStartInRange(startsAt)
        }

        const before = snapshot(row)
        const after = {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt?.toISOString() ?? null,
          championship: input.championship
        }
        const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
          (key) => after[key] !== before[key]
        )
        if (changed.length === 0) return { changed: [] }

        await tx
          .update(event)
          .set({
            startsAt,
            endsAt,
            championship: input.championship
          })
          .where(eq(event.id, row.id))
        await recordAdminAction(
          {
            kind: 'event.update',
            actorId: ctx.session.user.id,
            actorName: ctx.session.user.name,
            ...target(row),
            before: Object.fromEntries(changed.map((k) => [k, before[k]])),
            after: Object.fromEntries(changed.map((k) => [k, after[k]]))
          },
          tx
        )
        return { changed }
      })
    }),

  delete: adminProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        // Mesma trava e mesma recusa de `pub.deleteEvent`: reserva ativa ou
        // avaliação seguram o jogo, com a contagem na mensagem.
        const row = await lockEvent(tx, input.eventId)
        const impact = (
          await readEventDeletionImpact(tx, row.barId, row.id)
        ).get(row.id)
        const block = impact ? getEventDeletionBlock(impact) : null
        if (block) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: block })
        }
        await tx.delete(event).where(eq(event.id, row.id))
        await recordAdminAction(
          {
            kind: 'event.delete',
            actorId: ctx.session.user.id,
            actorName: ctx.session.user.name,
            ...target(row),
            before: snapshot(row),
            after: null
          },
          tx
        )
      })
      return { success: true }
    }),

  fix: adminProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        warning: z.enum(['duplicate', 'free_text'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        if (input.warning === 'duplicate') {
          // Trava os irmãos (mesmo bar, mesmo início) em ordem de id antes de
          // decidir: dois "apagar duplicado" ao mesmo tempo, um em cada
          // cópia, apagariam as duas. O segundo espera e já não vê duplicado.
          const [base] = await tx
            .select({ barId: event.barId, startsAt: event.startsAt })
            .from(event)
            .where(eq(event.id, input.eventId))
          if (base) {
            await tx.execute(
              sql`SELECT id FROM event WHERE bar_id = ${base.barId} AND starts_at = ${base.startsAt} ORDER BY id FOR UPDATE`
            )
          }
        }
        const row = await lockEvent(tx, input.eventId)
        const actor = {
          kind: 'event.fix' as const,
          actorId: ctx.session.user.id,
          actorName: ctx.session.user.name,
          ...target(row)
        }

        if (input.warning === 'duplicate') {
          if (!row.duplicate) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Este jogo não tem mais duplicado.'
            })
          }
          // Só o duplicado sem nada pendurado sai: nem reserva (de qualquer
          // estado), nem avaliação, nem presença.
          const impact = (
            await readEventDeletionImpact(tx, row.barId, row.id)
          ).get(row.id)
          if (
            !impact ||
            impact.pendingReservations +
              impact.confirmedReservations +
              impact.closedReservations +
              impact.ratings >
              0 ||
            impact.hasAttendance
          ) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message:
                'Este jogo tem código de quem vai, avaliação ou presença. Apague o outro, ou edite à mão.'
            })
          }
          await tx.delete(event).where(eq(event.id, row.id))
          await recordAdminAction(
            {
              ...actor,
              before: snapshot(row),
              after: null,
              detail: { warning: 'duplicate' }
            },
            tx
          )
          return { warning: 'duplicate' as const, teams: [] }
        }

        const suggestion =
          row.freeText && row.participantFreeText
            ? suggestTeams(
                row.participantFreeText,
                await catalogFor(tx, [row.sportId])
              )
            : null
        if (!suggestion) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Não há time do catálogo que case sem dúvida com este texto.'
          })
        }
        // O formulário do bar não guarda texto livre e time juntos.
        await tx.insert(eventParticipants).values(
          suggestion.map((t, position) => ({
            eventId: row.id,
            teamId: t.id,
            position
          }))
        )
        await tx
          .update(event)
          .set({ participantFreeText: null })
          .where(eq(event.id, row.id))
        await recordAdminAction(
          {
            ...actor,
            before: { participantFreeText: row.participantFreeText },
            after: { teams: suggestion.map((t) => t.name) },
            detail: { warning: 'free_text' }
          },
          tx
        )
        return {
          warning: 'free_text' as const,
          teams: suggestion.map((t) => t.name)
        }
      })
    })
})
