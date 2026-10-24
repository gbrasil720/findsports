/**
 * Título de um jogo: os times na ordem do confronto, por " × "; sem times, o
 * texto livre que o bar escreveu; sem nada disso, o campeonato.
 *
 * É a regra de toda tela (web, app, chat da IA). A mesma regra existe em SQL
 * para as leituras cruas (`gameTitle` em
 * `packages/api/src/lib/game-participants.ts`), e um teste de integração
 * confere que as duas dão o mesmo título.
 *
 * Módulo sem imports de propósito: é lido pelo navegador e pelo app
 * (`@findsports_oficial/db/game-title`) e não pode arrastar driver de banco.
 */

/** Um participante como as leituras devolvem: o nome, ou o time com nome. */
type Participant = string | { team?: { name: string } | null }

export type TitledGame = {
  /** Na ordem do confronto (`byMatchOrder`), como o servidor devolve. */
  participants: readonly Participant[]
  participantFreeText: string | null
  championship: string
}

/** Os nomes dos times do jogo, na ordem em que vieram. */
export function participantNames(
  game: Pick<TitledGame, 'participants'>
): string[] {
  return game.participants.flatMap((participant) => {
    const name =
      typeof participant === 'string' ? participant : participant.team?.name
    return name ? [name] : []
  })
}

/** "Corinthians × Palmeiras", senão o texto livre, senão o campeonato. */
export function gameTitle(game: TitledGame): string {
  return (
    participantNames(game).join(' × ') ||
    game.participantFreeText?.trim() ||
    game.championship
  )
}
