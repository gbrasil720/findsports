import { type SQL, sql } from '@findsports_oficial/db'
import type { eventParticipants } from '@findsports_oficial/db/schema/platform'

/**
 * A ordem do confronto: a que o bar informou (`position`, 0 = mandante) e,
 * nos jogos sem ela (anteriores à coluna), o nome do time. Só este arquivo
 * decide a ordem; `ep` e `t` são os apelidos de `teams` abaixo.
 */
const MATCH_ORDER = sql`ep.position, t.name`

/**
 * Quem joga, para as leituras em SQL cru (WEB-258). Sem os times o jogo era
 * nomeado só pelo campeonato, e dois jogos do mesmo campeonato no mesmo dia
 * ficavam indistinguíveis. `eventId` é a coluna do jogo na consulta de fora
 * (`sql\`e.id\``). Na ordem do confronto, a mesma de "Validar código".
 */
const teams = (eventId: SQL, aggregate: SQL) => sql`(
  SELECT ${aggregate}
  FROM event_participants ep
  JOIN team t ON t.id = ep.team_id
  WHERE ep.event_id = ${eventId}
)`

/** Nomes dos times; a tela monta o título com `getGameTitle`. */
export const participantNames = (eventId: SQL) =>
  sql<
    string[]
  >`COALESCE(${teams(eventId, sql`json_agg(t.name ORDER BY ${MATCH_ORDER})`)}, '[]'::json)`

/**
 * Times com escudo, para o card da busca. Na ordem do confronto: sem ela o
 * card e o perfil mostravam o mesmo jogo com os times trocados (WEB-345).
 */
export const participantTeams = (eventId: SQL) =>
  sql<
    { name: string; logoUrl: string | null }[]
  >`COALESCE(${teams(eventId, sql`json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url) ORDER BY ${MATCH_ORDER})`)}, '[]'::json)`

/**
 * A mesma ordem nas leituras do Drizzle: `participants: { orderBy:
 * byMatchOrder }` no relacional, `.orderBy(...byMatchOrder(eventParticipants))`
 * no construtor. Sem isto cada consulta devolve a ordem que o plano der.
 */
export const byMatchOrder = (participant: {
  position: typeof eventParticipants.position
  teamId: typeof eventParticipants.teamId
}) => [
  participant.position,
  sql`(SELECT t.name FROM team t WHERE t.id = ${participant.teamId})`
]

/** O título pronto, na ordem de `getGameTitle`: times, texto livre, campeonato. */
export const gameTitle = (game: {
  id: SQL
  participantFreeText: SQL
  championship: SQL
}) =>
  sql<string>`COALESCE(
    ${teams(game.id, sql`string_agg(t.name, ' × ' ORDER BY ${MATCH_ORDER})`)},
    NULLIF(${game.participantFreeText}, ''),
    ${game.championship}
  )`
