import { type SQL, sql } from '@findsports_oficial/db'

/** The active set is the highest immutable editorial version. */
export const currentClassicRulesCte = sql`
  current_classic_rules AS MATERIALIZED (
    SELECT
      r.id AS classic_rule_id,
      r.rule_version_id AS classic_rule_version_id,
      v.version AS classic_rule_version,
      r.rule_type,
      r.championship,
      r.team_a_slug,
      r.team_b_slug,
      r.reason AS classic_rule_reason
    FROM classic_rule r
    JOIN classic_rule_version v ON v.id = r.rule_version_id
    WHERE v.version = (SELECT MAX(version) FROM classic_rule_version)
  )
`

/** Match an event against one row from current_classic_rules. */
export function classicRuleMatches(
  eventAlias: SQL,
  ruleAlias: SQL = sql`cr`
): SQL {
  return sql`
    (
      ${ruleAlias}.rule_type = 'championship'
      AND LOWER(BTRIM(${eventAlias}.championship)) =
          LOWER(BTRIM(${ruleAlias}.championship))
    )
    OR
    (
      ${ruleAlias}.rule_type = 'team_pair'
      AND (
        (
          EXISTS (
            SELECT 1
            FROM event_participants ep_a
            JOIN team team_a ON team_a.id = ep_a.team_id
            WHERE ep_a.event_id = ${eventAlias}.id
              AND LOWER(team_a.slug) = LOWER(${ruleAlias}.team_a_slug)
          )
          AND EXISTS (
            SELECT 1
            FROM event_participants ep_b
            JOIN team team_b ON team_b.id = ep_b.team_id
            WHERE ep_b.event_id = ${eventAlias}.id
              AND LOWER(team_b.slug) = LOWER(${ruleAlias}.team_b_slug)
          )
        )
        OR
        (
          EXISTS (
            SELECT 1
            FROM event_participants ep_a
            JOIN team team_a ON team_a.id = ep_a.team_id
            WHERE ep_a.event_id = ${eventAlias}.id
              AND LOWER(team_a.slug) = LOWER(${ruleAlias}.team_b_slug)
          )
          AND EXISTS (
            SELECT 1
            FROM event_participants ep_b
            JOIN team team_b ON team_b.id = ep_b.team_id
            WHERE ep_b.event_id = ${eventAlias}.id
              AND LOWER(team_b.slug) = LOWER(${ruleAlias}.team_a_slug)
          )
        )
      )
    )
  `
}

/** Lateral lookup returns the rule and its explanation, at most once. */
export function classicRuleLateral(eventAlias: SQL): SQL {
  return sql`
    LEFT JOIN LATERAL (
      SELECT
        cr.classic_rule_id,
        cr.classic_rule_version_id,
        cr.classic_rule_version,
        cr.classic_rule_reason
      FROM current_classic_rules cr
      WHERE ${classicRuleMatches(eventAlias)}
      ORDER BY cr.rule_type, cr.classic_rule_id
      LIMIT 1
    ) classic ON true
  `
}
