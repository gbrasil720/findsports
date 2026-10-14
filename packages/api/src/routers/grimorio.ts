import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { ADMIN_ACTION_KINDS } from '@findsports_oficial/db/admin-action'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { z } from 'zod'

import { adminProcedure, router } from '../index'

const PAGE = 100

/**
 * O `Date` do JS tem milissegundo e a coluna tem microssegundo; ordenar e
 * paginar pelo instante truncado ao milissegundo, com o id de desempate,
 * não pula nem repete linha entre páginas. O instante vai como texto ISO:
 * um `Date` passado ao driver viraria hora local com fuso e, comparado com
 * `timestamp` sem fuso, deslocaria a página (dev em São Paulo).
 */
const createdAtMs = sql`date_trunc('milliseconds', ${adminAction.createdAt})`

function cursorBefore(cursor: string | null | undefined) {
  if (!cursor) return undefined
  const [iso, id] = cursor.split('|')
  if (!iso || !id || Number.isNaN(Date.parse(iso))) return undefined
  return sql`(${createdAtMs}, ${adminAction.id}) < (${iso}::timestamp, ${id})`
}

/**
 * WEB-384: leitura do Grimório. Não existe escrita por aqui: quem grava é a
 * própria ação (hook do better-auth, mutações do Houdini).
 */
export const grimorioRouter = router({
  list: adminProcedure
    .input(
      z.object({
        kinds: z.array(z.enum(ADMIN_ACTION_KINDS)).max(20).optional(),
        targetType: z
          .enum(['user', 'bar', 'event', 'config', 'job'])
          .optional(),
        targetId: z.string().max(255).optional(),
        /** Cursor `nextCursor` da página anterior: `<instante ISO>|<id>`. */
        cursor: z.string().max(120).nullish(),
        limit: z.number().int().min(1).max(PAGE).default(PAGE)
      })
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(adminAction)
        .where(
          and(
            input.kinds?.length
              ? inArray(adminAction.kind, input.kinds)
              : undefined,
            input.targetType
              ? eq(adminAction.targetType, input.targetType)
              : undefined,
            input.targetId
              ? eq(adminAction.targetId, input.targetId)
              : undefined,
            cursorBefore(input.cursor)
          )
        )
        .orderBy(sql`${createdAtMs} DESC, ${adminAction.id} DESC`)
        .limit(input.limit + 1)
      const entries = rows.slice(0, input.limit)
      const last = entries.at(-1)
      const hasMore = rows.length > input.limit
      return {
        entries,
        hasMore,
        nextCursor:
          hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null
      }
    })
})
