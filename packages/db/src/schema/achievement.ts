import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Conquistas secretas (WEB-558): as que não saem das visitas nem das
 * avaliações, e por isso ficam gravadas. Hoje só "Achou o Jules" (`jules`),
 * por tocar no Jules parado no app ou buscar "jules" no Explorar do web. Uma
 * linha por pessoa e conquista: achar de novo não muda a data.
 */
export const secretAchievement = pgTable(
  'secret_achievement',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id', { enum: ['jules'] }).notNull(),
    // Onde achou: o toque no app ou a busca do web.
    via: text('via', { enum: ['app', 'web'] }).notNull(),
    foundAt: timestamp('found_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })]
)
