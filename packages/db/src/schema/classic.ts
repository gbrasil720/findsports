import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'

/**
 * Regras editoriais de clássico. Uma versão nova substitui o conjunto ativo;
 * versões antigas ficam intactas para que a classificação histórica nunca
 * seja reescrita.
 */
export const classicRuleTypeEnum = pgEnum('classic_rule_type', [
  'championship',
  'team_pair'
])

export const classicRuleVersion = pgTable('classic_rule_version', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull()
})

export const classicRule = pgTable(
  'classic_rule',
  {
    id: text('id').primaryKey(),
    ruleVersionId: text('rule_version_id')
      .notNull()
      .references(() => classicRuleVersion.id),
    ruleType: classicRuleTypeEnum('rule_type').notNull(),
    championship: text('championship'),
    teamASlug: text('team_a_slug'),
    teamBSlug: text('team_b_slug'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    check(
      'classic_rule_shape',
      sql`(
        (${table.ruleType} = 'championship'
          AND ${table.championship} IS NOT NULL
          AND ${table.teamASlug} IS NULL
          AND ${table.teamBSlug} IS NULL)
        OR
        (${table.ruleType} = 'team_pair'
          AND ${table.championship} IS NULL
          AND ${table.teamASlug} IS NOT NULL
          AND ${table.teamBSlug} IS NOT NULL
          AND ${table.teamASlug} <> ${table.teamBSlug})
      )`
    ),
    index('classic_rule_ruleVersionId_idx').on(table.ruleVersionId),
    unique('classic_rule_unique_rule_key')
      .on(
        table.ruleVersionId,
        table.ruleType,
        table.championship,
        table.teamASlug,
        table.teamBSlug
      )
      .nullsNotDistinct()
  ]
)
