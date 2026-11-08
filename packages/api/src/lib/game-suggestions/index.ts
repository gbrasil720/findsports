import { nearbyBarsSource } from './nearby-bars'

/*
 * Sugestões de jogo para o bar publicar com um toque: "Seu primeiro jogo" no
 * cadastro e o passo Jogos do passeio pelo painel. A tela só conhece
 * `GameSuggestion` e `pub.gameSuggestions`; de onde os jogos vêm é a fonte.
 *
 * Hoje há uma fonte só: os jogos que outros bares no ar da mesma cidade já
 * publicaram para os próximos 7 dias (`nearby-bars.ts`).
 *
 * Encaixe: o catálogo semanal de jogos (WEB-433, em protótipo) entra como
 * outra `GameSuggestionSource` — por exemplo um `catalogSource` em
 * `catalog.ts`, ou uma que junte as duas — trocada aqui embaixo, em
 * `gameSuggestionSource`. A tela, o procedimento e o formato não mudam; se
 * ela trouxer outro título para a seção, ele entra em `GameSuggestions`.
 */

/** Um jogo pronto para virar `pub.createEvent`. */
export type GameSuggestion = {
  /** Início em ISO (UTC) e título: o mesmo jogo em vários bares é um só. */
  key: string
  title: string
  sportId: string
  championship: string
  startsAt: string
  /** Times do catálogo, na ordem do confronto (mandante primeiro). */
  participantIds: string[]
  participantFreeText: string | null
}

export type SuggestionRequest = {
  /** O bar que pede: os jogos que ele já tem não voltam como sugestão. */
  barId: string
  city: string
  now: Date
  limit: number
}

export interface GameSuggestionSource {
  suggest(request: SuggestionRequest): Promise<GameSuggestion[]>
}

/** Quantas sugestões a tela mostra. */
export const GAME_SUGGESTION_LIMIT = 6

export const gameSuggestionSource: GameSuggestionSource = nearbyBarsSource
