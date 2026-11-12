import { catalogSource } from './catalog'
import { nearbyBarsSource } from './nearby-bars'

/*
 * Sugestões de jogo para o bar publicar com um toque: "Seu primeiro jogo" no
 * cadastro e o passo Jogos do passeio pelo painel. A tela só conhece
 * `GameSuggestion` e `pub.gameSuggestions`; de onde os jogos vêm é a fonte.
 *
 * Duas fontes, nesta ordem: o catálogo dos jogos da semana com onde passa
 * (WEB-433, `catalog.ts`), ordenado pelo que combina com o bar; e, para
 * completar, os jogos que outros bares no ar da mesma cidade já publicaram
 * para os próximos 7 dias (`nearby-bars.ts`). Os campos do catálogo são
 * opcionais: o app e o web publicados antes deles continuam lendo o formato.
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
  /** Onde passa no Brasil; nulo quando não sabemos (ou fonte sem canal). */
  channels?: string[] | null
  /** Falso quando o canal é a lista da competição, não a transmissão. */
  channelConfirmed?: boolean
  /** Torcedores dos dois times na cidade do bar; nulo abaixo de 10. */
  fansInCity?: number | null
  /** Outros bares do bairro que já publicaram o jogo. */
  barsInNeighborhood?: number | null
  /** Por que combina com o bar, do histórico dele. */
  reason?: string | null
  /** Time da casa que joga ("Seu time"); nulo ou ausente sem ele. */
  houseTeam?: string | null
  /** O primeiro da lista, o que mais combina. */
  featured?: boolean
  /** O jogo em `weekly_game`, para o "Não passo esse". */
  catalogId?: string | null
}

export type SuggestionRequest = {
  /** O bar que pede: os jogos que ele já tem não voltam como sugestão. */
  barId: string
  city: string
  /** Bairro do bar: os números do catálogo contam os bares dele. */
  neighborhood?: string
  now: Date
  limit: number
}

export interface GameSuggestionSource {
  suggest(request: SuggestionRequest): Promise<GameSuggestion[]>
}

/** Quantas sugestões a tela mostra, e o máximo que ela pode pedir. */
export const GAME_SUGGESTION_LIMIT = 6
export const GAME_SUGGESTION_MAX = 10

/** Catálogo primeiro; os jogos dos bares perto completam até o limite. */
export const gameSuggestionSource: GameSuggestionSource = {
  async suggest(request) {
    const fromCatalog = await catalogSource.suggest(request)
    if (fromCatalog.length >= request.limit) return fromCatalog
    const keys = new Set(fromCatalog.map((s) => s.key))
    const nearby = await nearbyBarsSource.suggest(request)
    return [...fromCatalog, ...nearby.filter((s) => !keys.has(s.key))].slice(
      0,
      request.limit
    )
  }
}
