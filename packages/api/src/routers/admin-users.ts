import { and, count, db, eq, or, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { z } from 'zod'

import { adminProcedure, router } from '../index'

const LIMIT = 200

/**
 * WEB-193: `/internal/manage-users` buscava os 200 mais novos pelo
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
      const pattern = input.search
        ? `%${input.search.replace(/[\\%_]/g, '\\$&')}%`
        : null
      const where = and(
        input.role ? eq(user.role, input.role) : undefined,
        pattern
          ? or(
              sql`${user.name} ILIKE ${pattern} ESCAPE '\\'`,
              sql`${user.email} ILIKE ${pattern} ESCAPE '\\'`
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
            banExpires: user.banExpires,
            createdAt: user.createdAt,
            image: user.image
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
    })
})
