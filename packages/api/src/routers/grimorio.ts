import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { ADMIN_ACTION_KINDS } from '@findsports_oficial/db/admin-action'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { z } from 'zod'

import { adminProcedure, router } from '../index'

const PAGE = 100

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
        /** Cursor: devolve o que é mais antigo que este instante. */
        cursor: z.coerce.date().nullish(),
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
            input.cursor
              ? sql`${adminAction.createdAt} < ${input.cursor}`
              : undefined
          )
        )
        .orderBy(sql`${adminAction.createdAt} DESC, ${adminAction.id} DESC`)
        .limit(input.limit + 1)
      return {
        entries: rows.slice(0, input.limit),
        hasMore: rows.length > input.limit
      }
    })
})
