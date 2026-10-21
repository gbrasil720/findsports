import { and, db, eq, isNull, or, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendship } from '@findsports_oficial/db/schema/social'
import { readAchievements } from './achievements-read'
import { readVisitedGames } from './attendance'

/*
 * Amigos (S1 do design do app, decisões do dono em 21/10/2026). O roteador é
 * `routers/friends.ts`; aqui ficam as regras e as consultas que ele divide.
 */

/** O `@usuário`: 3 a 20 letras minúsculas, números, ponto ou sublinhado. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/

/** "Marina Costa" vira "marinacosta"; acento e espaço saem. */
export function usernameFrom(name: string) {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const first = words[0] ?? ''
  const last = words.length > 1 ? (words.at(-1) ?? '') : ''
  const base = `${first}${last}`.slice(0, 16)
  return base.length >= 3 ? base : `torcedor${base}`.slice(0, 16)
}

/** O `@` digitado: sem o "@", em minúsculas. */
export const normalizeUsername = (typed: string) =>
  typed.trim().replace(/^@/, '').toLowerCase()

/** O código do QR: iniciais e quatro números, "GB-4821". */
export function friendCodeFrom(name: string, digits: number) {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean)
  const initials =
    words.length === 0
      ? 'ON'
      : `${words[0]?.[0] ?? ''}${words.length > 1 ? (words.at(-1)?.[0] ?? '') : (words[0]?.[1] ?? 'N')}`
  return `${initials}-${String(digits).padStart(4, '0')}`
}

/** O código digitado ou lido do QR, como o banco guarda. */
export const normalizeFriendCode = (typed: string) =>
  typed.trim().toUpperCase().replace(/\s+/g, '')

const randomDigits = (max: number) => Math.floor(Math.random() * max)

/**
 * O `@usuário` e o código de quem abre os amigos pela primeira vez. Tenta o
 * nome puro, depois com números, até achar um livre: a unicidade é do banco,
 * e duas contas gerando ao mesmo tempo só fazem uma delas tentar de novo.
 */
export async function ensureSocialIdentity(userId: string) {
  const [me] = await db
    .select({
      name: user.name,
      username: user.username,
      friendCode: user.friendCode
    })
    .from(user)
    .where(eq(user.id, userId))
  if (!me) throw new Error('Conta não encontrada.')
  let { username, friendCode } = me
  for (let attempt = 0; !username && attempt < 8; attempt++) {
    const base = usernameFrom(me.name)
    const candidate =
      attempt === 0
        ? base
        : `${base}${randomDigits(attempt < 4 ? 100 : 10_000)}`
    const [saved] = await db
      .update(user)
      .set({ username: candidate })
      .where(and(eq(user.id, userId), isNull(user.username)))
      .returning({ username: user.username })
      .catch(() => [])
    username = saved?.username ?? null
  }
  for (let attempt = 0; !friendCode && attempt < 8; attempt++) {
    const [saved] = await db
      .update(user)
      .set({ friendCode: friendCodeFrom(me.name, randomDigits(10_000)) })
      .where(and(eq(user.id, userId), isNull(user.friendCode)))
      .returning({ friendCode: user.friendCode })
      .catch(() => [])
    friendCode = saved?.friendCode ?? null
  }
  if (!username || !friendCode)
    throw new Error('Não foi possível gerar o @ e o código de amigo.')
  return { username, friendCode }
}

/** Os amigos de `userId` (pedidos aceitos), como subconsulta de ids. */
export const friendIdsOf = (userId: string) => sql`(
  SELECT CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
  FROM friendship f
  WHERE f.accepted_at IS NOT NULL
    AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
)`

export type Relation = 'self' | 'friends' | 'sent' | 'received' | 'none'

/** A linha da dupla, em qualquer direção. */
export async function readFriendship(me: string, other: string) {
  const [row] = await db
    .select()
    .from(friendship)
    .where(
      or(
        and(eq(friendship.requesterId, me), eq(friendship.addresseeId, other)),
        and(eq(friendship.requesterId, other), eq(friendship.addresseeId, me))
      )
    )
  return row ?? null
}

export function relationOf(
  me: string,
  other: string,
  row: { requesterId: string; acceptedAt: Date | null } | null
): Relation {
  if (me === other) return 'self'
  if (!row) return 'none'
  if (row.acceptedAt) return 'friends'
  return row.requesterId === me ? 'sent' : 'received'
}

/** A relação de `me` com cada um de `ids`, numa consulta. */
export async function relationsWith(me: string, ids: string[]) {
  const map = new Map<string, Relation>()
  if (!ids.length) return map
  const rows = await db
    .select()
    .from(friendship)
    .where(
      or(
        and(
          eq(friendship.requesterId, me),
          sql`${friendship.addresseeId} IN ${ids}`
        ),
        and(
          eq(friendship.addresseeId, me),
          sql`${friendship.requesterId} IN ${ids}`
        )
      )
    )
  for (const row of rows) {
    const other = row.requesterId === me ? row.addresseeId : row.requesterId
    map.set(other, relationOf(me, other, row))
  }
  return map
}

/** Quantos amigos `me` tem em comum com cada um de `ids`. */
export async function mutualCounts(me: string, ids: string[]) {
  const map = new Map<string, number>()
  if (!ids.length) return map
  const rows = await db.execute<{ id: string; mutual: string }>(sql`
    SELECT x.id, count(*) AS mutual
    FROM (
      SELECT f.requester_id AS id, f.addressee_id AS other
      FROM friendship f
      WHERE f.accepted_at IS NOT NULL AND f.requester_id IN ${ids}
      UNION ALL
      SELECT f.addressee_id, f.requester_id
      FROM friendship f
      WHERE f.accepted_at IS NOT NULL AND f.addressee_id IN ${ids}
    ) x
    WHERE x.other IN ${friendIdsOf(me)}
    GROUP BY x.id
  `)
  for (const row of rows.rows) map.set(row.id, Number(row.mutual))
  return map
}

/** O primeiro dia do mês de Brasília, em UTC (como `event.starts_at`). */
export function monthStart(now = new Date()) {
  const [year, month] = now
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    .split('-')
  // Meia-noite em Brasília é 03:00 UTC (sem horário de verão desde 2019).
  return new Date(`${year}-${month}-01T03:00:00Z`)
}

/** O que o perfil do amigo compara (11d): o mês de cada um. */
export async function readMonth(userId: string, now = new Date()) {
  const [visits, achievements] = await Promise.all([
    readVisitedGames(userId),
    readAchievements(userId)
  ])
  const start = monthStart(now)
  const month = visits.filter((visit) => visit.startsAt >= start)
  return {
    stats: {
      bars: new Set(month.map((visit) => visit.barId)).size,
      games: month.length,
      neighborhoods: new Set(month.map((visit) => visit.neighborhood)).size,
      achievements: achievements.achievements.filter((a) => a.unlockedAt).length
    },
    level: achievements.level,
    bars: new Map(
      visits.map((visit) => [
        visit.barId,
        {
          id: visit.barId,
          name: visit.barName,
          photoUrl: visit.photoUrl,
          active: visit.barActive
        }
      ])
    )
  }
}

/**
 * Se `viewer` vê os bares validados e os jogos marcados de quem tem essa
 * privacidade (11i: "Quem vê os bares que você validou").
 */
export const canSeeActivity = (
  visibility: 'everyone' | 'friends' | 'nobody',
  relation: Relation
) =>
  relation === 'self' ||
  visibility === 'everyone' ||
  (visibility === 'friends' && relation === 'friends')
