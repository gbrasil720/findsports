import { and, db, eq, isNull, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendCall, friendship } from '@findsports_oficial/db/schema/social'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { fanProcedure, router } from '../index'
import { readMyGames } from '../lib/attendance'
import { deleteCallsBetween, readCallNotices } from '../lib/friend-calls'
import {
  canSeeActivity,
  ensureSocialIdentity,
  friendIdsOf,
  monthStart,
  mutualCounts,
  mutualInitials,
  normalizeFriendCode,
  normalizeUsername,
  readFriendship,
  readMonth,
  relationOf,
  relationsWith,
  USERNAME_PATTERN
} from '../lib/friends'
import { attendanceRouter } from './attendance'

/*
 * Amigos (S1 do design do app: 11a lista, 11b busca, 11c código, 11d perfil;
 * decisões do dono em 21/10/2026). Só torcedor. O web não tem tela para isso.
 */

const userId = z.string().min(1).max(64)

/** Avisos com mais de 30 dias saem da tela (19c). */
const NOTICE_DAYS = 30
const via = z.enum(['search', 'code', 'link', 'contacts', 'suggestion'])

/** O que uma pessoa mostra numa linha de lista. */
const PERSON = {
  id: user.id,
  name: user.name,
  username: user.username,
  city: user.searchCityName,
  image: user.image
}

/** Gente que pode aparecer para outro torcedor: conta de torcedor, sem ban. */
const listable = sql`${user.role} = 'fan' AND ${user.banned} IS NOT TRUE`

async function withRelations<T extends { id: string }>(
  me: string,
  people: T[]
) {
  const ids = people.map((p) => p.id)
  const [relations, mutual] = await Promise.all([
    relationsWith(me, ids),
    mutualCounts(me, ids)
  ])
  return people.map((person) => ({
    ...person,
    relation: relations.get(person.id) ?? ('none' as const),
    mutual: mutual.get(person.id) ?? 0
  }))
}

/**
 * Manda o pedido de `me` para `target`, ou aceita o que `target` já mandou.
 * Respeita "Quem pode te adicionar" (11i) de quem recebe.
 */
async function sendRequest(
  me: string,
  target: string,
  how: z.infer<typeof via>,
  acceptNow = false
) {
  if (me === target)
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Esse código é o seu.'
    })
  const [other] = await db
    .select({ from: user.friendRequestsFrom })
    .from(user)
    .where(and(eq(user.id, target), listable))
  if (!other)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Pessoa não encontrada.'
    })
  const row = await readFriendship(me, target)
  if (row?.acceptedAt) return 'friends' as const
  if (row && row.requesterId === target) {
    await db
      .update(friendship)
      .set({ acceptedAt: new Date() })
      .where(
        and(eq(friendship.requesterId, target), eq(friendship.addresseeId, me))
      )
    return 'friends' as const
  }
  if (row) return 'sent' as const
  if (!acceptNow && other.from === 'nobody')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Essa pessoa não recebe pedidos de amizade.'
    })
  if (!acceptNow && other.from === 'friends_of_friends') {
    const mutual = (await mutualCounts(me, [target])).get(target) ?? 0
    if (!mutual)
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Essa pessoa só recebe pedidos de amigos de amigos.'
      })
  }
  await db
    .insert(friendship)
    .values({
      requesterId: acceptNow ? target : me,
      addresseeId: acceptNow ? me : target,
      via: how,
      acceptedAt: acceptNow ? new Date() : null
    })
    .onConflictDoNothing()
  return acceptNow ? ('friends' as const) : ('sent' as const)
}

export const friendsRouter = router({
  /** O seu `@`, o seu código e a sua privacidade. Gera o que faltar. */
  me: fanProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id
    const identity = await ensureSocialIdentity(me)
    const [row] = await db
      .select({
        activityVisibility: user.activityVisibility,
        friendRequestsFrom: user.friendRequestsFrom,
        city: user.searchCityName
      })
      .from(user)
      .where(eq(user.id, me))
    return { ...identity, ...row }
  }),

  /** A tela de amigos (11a): pedidos recebidos, sugestões e os amigos. */
  overview: fanProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id
    const start = monthStart()
    const [requests, friends, suggestions] = await Promise.all([
      db
        .select({ ...PERSON, at: friendship.createdAt, via: friendship.via })
        .from(friendship)
        .innerJoin(user, eq(user.id, friendship.requesterId))
        .where(
          and(eq(friendship.addresseeId, me), isNull(friendship.acceptedAt))
        )
        .orderBy(sql`${friendship.createdAt} desc`),
      db.execute<{
        id: string
        name: string
        username: string | null
        city: string | null
        image: string | null
        since: string
        bars: string | null
      }>(sql`
        SELECT u.id, u.name, u.username, u.search_city_name AS city, u.image,
          f.accepted_at AS since,
          CASE WHEN u.activity_visibility = 'nobody' THEN NULL ELSE (
            SELECT count(DISTINCT e.bar_id)
            FROM reservation_code_use cu
            JOIN reservation_code c ON c.id = cu.code_id
            JOIN reservation r ON r.id = c.reservation_id
            JOIN event e ON e.id = r.event_id
            WHERE r.user_id = u.id AND cu.undone_at IS NULL
              AND e.starts_at >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          ) END AS bars
        FROM friendship f
        JOIN "user" u ON u.id = CASE WHEN f.requester_id = ${me}
          THEN f.addressee_id ELSE f.requester_id END
        WHERE f.accepted_at IS NOT NULL
          AND (f.requester_id = ${me} OR f.addressee_id = ${me})
        ORDER BY bars DESC NULLS LAST, u.name
      `),
      // Amigos de amigos que ainda não têm nada com você e aceitam pedidos.
      db.execute<{ id: string; mutual: string }>(sql`
        SELECT fof.id, count(*) AS mutual
        FROM ${friendIdsOf(me)} AS mine(id)
        JOIN LATERAL (
          SELECT CASE WHEN f.requester_id = mine.id THEN f.addressee_id ELSE f.requester_id END AS id
          FROM friendship f
          WHERE f.accepted_at IS NOT NULL
            AND (f.requester_id = mine.id OR f.addressee_id = mine.id)
        ) fof ON true
        JOIN "user" u ON u.id = fof.id
        WHERE fof.id <> ${me}
          AND u.role = 'fan' AND u.banned IS NOT TRUE
          AND u.friend_requests_from <> 'nobody'
          AND NOT EXISTS (
            SELECT 1 FROM friendship x
            WHERE (x.requester_id = ${me} AND x.addressee_id = fof.id)
               OR (x.requester_id = fof.id AND x.addressee_id = ${me})
          )
        GROUP BY fof.id
        ORDER BY count(*) DESC, fof.id
        LIMIT 8
      `)
    ])
    const suggestionIds = suggestions.rows.map((row) => row.id)
    const people = suggestionIds.length
      ? await db
          .select(PERSON)
          .from(user)
          .where(sql`${user.id} IN ${suggestionIds}`)
      : []
    const mutual = new Map(
      suggestions.rows.map((row) => [row.id, Number(row.mutual)])
    )
    const requestMutual = await mutualCounts(
      me,
      requests.map((r) => r.id)
    )
    return {
      requests: requests.map((r) => ({
        ...r,
        mutual: requestMutual.get(r.id) ?? 0
      })),
      suggestions: suggestionIds.flatMap((id) => {
        const person = people.find((p) => p.id === id)
        return person ? [{ ...person, mutual: mutual.get(id) ?? 0 }] : []
      }),
      friends: friends.rows.map(({ since, bars, ...person }) => ({
        ...person,
        since: new Date(since).toISOString(),
        barsThisMonth: bars === null ? null : Number(bars)
      }))
    }
  }),

  /**
   * Os avisos de amigos (19c): pedidos recebidos e ainda sem resposta, com os
   * amigos em comum, e os seus pedidos que foram aceitos nos últimos 30 dias.
   * Pedido recebido não vence: fica até ser respondido.
   */
  notices: fanProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id
    const since = new Date(Date.now() - NOTICE_DAYS * 86_400_000)
    const [requests, accepted, calls] = await Promise.all([
      db
        .select({ ...PERSON, at: friendship.createdAt })
        .from(friendship)
        .innerJoin(user, eq(user.id, friendship.requesterId))
        .where(
          and(
            eq(friendship.addresseeId, me),
            isNull(friendship.acceptedAt),
            listable
          )
        )
        .orderBy(sql`${friendship.createdAt} desc`),
      db
        .select({ ...PERSON, at: friendship.acceptedAt })
        .from(friendship)
        .innerJoin(user, eq(user.id, friendship.addresseeId))
        .where(
          and(
            eq(friendship.requesterId, me),
            sql`${friendship.acceptedAt} >= ${since}`,
            listable
          )
        )
        .orderBy(sql`${friendship.acceptedAt} desc`),
      // O chamado de amigo (Rodada 24): recebidos e os que viraram "Vou também".
      readCallNotices(me, NOTICE_DAYS)
    ])
    const ids = [...requests, ...accepted].map((p) => p.id)
    const [mutual, faces] = await Promise.all([
      mutualCounts(me, ids),
      mutualInitials(me, ids)
    ])
    const shape = <T extends { id: string; at: Date | null }>(person: T) => ({
      ...person,
      at: (person.at ?? new Date()).toISOString(),
      mutual: mutual.get(person.id) ?? 0,
      mutualInitials: faces.get(person.id) ?? []
    })
    return {
      requests: requests.map(shape),
      accepted: accepted.map(shape),
      ...calls
    }
  }),

  /**
   * Resposta ao chamado de amigo, só por quem recebeu. "Vou também" marca
   * presença pelo mesmo caminho de "Vou assistir aqui" (`attendance.set`) e
   * devolve o código do balcão quando o bar emite; "Agora não" só grava a
   * resposta, e quem chamou não recebe aviso.
   */
  respondCall: fanProcedure
    .input(
      z.object({
        callId: z.string().min(1).max(64),
        answer: z.enum(['going', 'not_now'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      const mine = and(
        eq(friendCall.id, input.callId),
        eq(friendCall.toUserId, me)
      )
      // Responde só o que ainda está pendente, numa linha só: dois toques
      // juntos não respondem duas vezes.
      const [call] = await db
        .update(friendCall)
        .set({ status: input.answer, respondedAt: new Date() })
        .where(and(mine, eq(friendCall.status, 'pending')))
        .returning({ eventId: friendCall.eventId })
      if (!call) {
        const [exists] = await db
          .select({ id: friendCall.id })
          .from(friendCall)
          .where(mine)
        throw exists
          ? new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Você já respondeu esse chamado.'
            })
          : new TRPCError({
              code: 'NOT_FOUND',
              message: 'Chamado não encontrado.'
            })
      }
      if (input.answer === 'not_now')
        return { status: input.answer, eventId: call.eventId, code: null }
      try {
        const marked = await attendanceRouter
          .createCaller(ctx)
          .set({ eventId: call.eventId, attending: true })
        return {
          status: input.answer,
          eventId: call.eventId,
          code: marked.code
        }
      } catch (error) {
        // Presença recusada (jogo começou, bar saiu do ar): o chamado volta a
        // pendente, sem "vai também" para quem chamou.
        await db
          .update(friendCall)
          .set({ status: 'pending', respondedAt: null })
          .where(mine)
        throw error
      }
    }),

  /** Busca por nome ou `@` (11b): todos, amigos de amigos ou da sua cidade. */
  search: fanProcedure
    .input(
      z.object({
        query: z.string().trim().max(60),
        scope: z.enum(['all', 'friendsOfFriends', 'near']).default('all')
      })
    )
    .query(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      const typed = normalizeUsername(input.query)
      if (typed.length < 2) return []
      const pattern = `%${typed}%`
      const scope =
        input.scope === 'friendsOfFriends'
          ? sql`AND ${user.id} IN (
              SELECT CASE WHEN f.requester_id = mine.id THEN f.addressee_id ELSE f.requester_id END
              FROM ${friendIdsOf(me)} AS mine(id)
              JOIN friendship f ON f.accepted_at IS NOT NULL
                AND (f.requester_id = mine.id OR f.addressee_id = mine.id)
            )`
          : input.scope === 'near'
            ? sql`AND ${user.searchCityName} = (
                SELECT search_city_name FROM "user" WHERE id = ${me}
              )`
            : sql``
      const people = await db
        .select(PERSON)
        .from(user)
        .where(
          sql`${listable} AND ${user.id} <> ${me}
            AND (search_normalize(${user.name}) LIKE search_normalize(${pattern})
              OR ${user.username} LIKE ${`${typed}%`})
            ${scope}`
        )
        .orderBy(sql`${user.username} = ${typed} DESC, ${user.name}`)
        .limit(20)
      return withRelations(me, people)
    }),

  /** Manda pedido (ou aceita o que a pessoa já mandou). */
  request: fanProcedure
    .input(z.object({ userId, via: via.default('search') }))
    .mutation(async ({ ctx, input }) => ({
      relation: await sendRequest(ctx.session.user.id, input.userId, input.via)
    })),

  /** Aceita ou recusa um pedido recebido. Recusar apaga o pedido. */
  respond: fanProcedure
    .input(z.object({ userId, accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const where = and(
        eq(friendship.requesterId, input.userId),
        eq(friendship.addresseeId, ctx.session.user.id),
        isNull(friendship.acceptedAt)
      )
      if (input.accept)
        await db.update(friendship).set({ acceptedAt: new Date() }).where(where)
      else {
        await db.delete(friendship).where(where)
        await deleteCallsBetween(ctx.session.user.id, input.userId)
      }
      return {
        relation: input.accept ? ('friends' as const) : ('none' as const)
      }
    }),

  /** Desfaz a amizade ou cancela o pedido enviado. */
  remove: fanProcedure
    .input(z.object({ userId }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      await db.delete(friendship).where(
        sql`(${friendship.requesterId} = ${me} AND ${friendship.addresseeId} = ${input.userId})
          OR (${friendship.requesterId} = ${input.userId} AND ${friendship.addresseeId} = ${me})`
      )
      // Sem amizade, o chamado não fica para responder nem para ver.
      await deleteCallsBetween(me, input.userId)
      return { relation: 'none' as const }
    }),

  /** Quem é o dono de um código (QR lido, código digitado ou link). */
  byCode: fanProcedure
    .input(z.object({ code: z.string().trim().min(3).max(16) }))
    .query(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      const [person] = await db
        .select(PERSON)
        .from(user)
        .where(
          and(eq(user.friendCode, normalizeFriendCode(input.code)), listable)
        )
      if (!person) return null
      const row = await readFriendship(me, person.id)
      return { ...person, relation: relationOf(me, person.id, row) }
    }),

  /**
   * Pelo link de convite: conta criada há menos de um dia já entra como amiga
   * de quem convidou; conta antiga manda um pedido, como pelo código.
   */
  joinByInvite: fanProcedure
    .input(z.object({ code: z.string().trim().min(3).max(16) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      const [inviter] = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(eq(user.friendCode, normalizeFriendCode(input.code)), listable)
        )
      if (!inviter)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Esse convite não vale mais.'
        })
      const created = new Date(ctx.session.user.createdAt).getTime()
      const fresh = Date.now() - created < 86_400_000
      return {
        relation: await sendRequest(me, inviter.id, 'link', fresh),
        inviterId: inviter.id
      }
    }),

  /** O perfil de outra pessoa (11d), com o que a privacidade dela deixa ver. */
  profile: fanProcedure
    .input(z.object({ userId }))
    .query(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      const [person] = await db
        .select({
          ...PERSON,
          activityVisibility: user.activityVisibility
        })
        .from(user)
        .where(and(eq(user.id, input.userId), listable))
      if (!person)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pessoa não encontrada.'
        })
      const row = await readFriendship(me, person.id)
      const relation = relationOf(me, person.id, row)
      const { activityVisibility, ...shown } = person
      const base = {
        ...shown,
        relation,
        friendsSince: row?.acceptedAt?.toISOString() ?? null,
        mutual: (await mutualCounts(me, [person.id])).get(person.id) ?? 0
      }
      if (!canSeeActivity(activityVisibility, relation))
        return {
          ...base,
          visible: false as const,
          level: null,
          month: null,
          nextGame: null,
          barsInCommon: []
        }
      const now = new Date()
      const [mine, theirs, games] = await Promise.all([
        readMonth(me, now),
        readMonth(person.id, now),
        readMyGames(person.id, now)
      ])
      // O jogo marcado mais próximo que ainda não acabou.
      const next = games
        .filter((game) => !game.ended && game.barActive)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
      return {
        ...base,
        visible: true as const,
        level: theirs.level,
        month: { me: mine.stats, them: theirs.stats },
        nextGame: next
          ? {
              eventId: next.eventId,
              barId: next.barId,
              barName: next.barName,
              photoUrl: next.photoUrl,
              championship: next.championship,
              participants: next.participants,
              participantFreeText: next.participantFreeText,
              startsAt: next.startsAt.toISOString(),
              endsAt: next.endsAt.toISOString()
            }
          : null,
        barsInCommon: [...theirs.bars.values()].filter(
          (bar) => bar.active && mine.bars.has(bar.id)
        )
      }
    }),

  /** Troca o `@` (Configurações, Conta). */
  updateUsername: fanProcedure
    .input(z.object({ username: z.string().max(40) }))
    .mutation(async ({ ctx, input }) => {
      const username = normalizeUsername(input.username)
      if (!USERNAME_PATTERN.test(username))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Use de 3 a 20 letras, números, ponto ou sublinhado, sem espaço nem acento.'
        })
      const [taken] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, username))
      if (taken && taken.id !== ctx.session.user.id)
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Esse @ já é de outra pessoa.'
        })
      await db
        .update(user)
        .set({ username })
        .where(eq(user.id, ctx.session.user.id))
      return { username }
    }),

  /** Privacidade (11i). */
  updatePrivacy: fanProcedure
    .input(
      z.object({
        activityVisibility: z
          .enum(['everyone', 'friends', 'nobody'])
          .optional(),
        friendRequestsFrom: z
          .enum(['everyone', 'friends_of_friends', 'nobody'])
          .optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.activityVisibility || input.friendRequestsFrom)
        await db.update(user).set(input).where(eq(user.id, ctx.session.user.id))
      return input
    }),

  /**
   * Quem da agenda do celular já está na Onside. O app manda só o SHA-256 de
   * cada e-mail (minúsculo, sem espaço), nunca o e-mail. Só aparece quem
   * aceita pedidos de qualquer pessoa: os outros não são revelados.
   */
  matchContacts: fanProcedure
    .input(
      z.object({
        hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(2000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      if (!input.hashes.length) return []
      // ponytail: compara o hash de cada conta a cada vez (varre `user`);
      // com muitas contas, uma coluna com o hash e índice.
      const people = await db
        .select(PERSON)
        .from(user)
        .where(
          sql`${listable} AND ${user.id} <> ${me}
            AND ${user.friendRequestsFrom} = 'everyone'
            AND encode(sha256(convert_to(lower(trim(${user.email})), 'UTF8')), 'hex')
              IN ${input.hashes}`
        )
        .limit(50)
      return withRelations(me, people)
    })
})
