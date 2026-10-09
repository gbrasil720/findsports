import { type SQL, sql } from '@findsports_oficial/db'

/**
 * Quem joga, para as leituras em SQL cru (WEB-258). Sem os times o jogo era
 * nomeado só pelo campeonato, e dois jogos do mesmo campeonato no mesmo dia
 * ficavam indistinguíveis. `eventId` é a coluna do jogo na consulta de fora
 * (`sql\`e.id\``). Ordem alfabética, a mesma de "Validar código".
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
  >`COALESCE(${teams(eventId, sql`json_agg(t.name ORDER BY t.name)`)}, '[]'::json)`

/** O título pronto, na ordem de `getGameTitle`: times, texto livre, campeonato. */
export const gameTitle = (game: {
  id: SQL
  participantFreeText: SQL
  championship: SQL
}) =>
  sql<string>`COALESCE(
    ${teams(game.id, sql`string_agg(t.name, ' × ' ORDER BY t.name)`)},
    NULLIF(${game.participantFreeText}, ''),
    ${game.championship}
  )`
