/**
 * Título de um jogo. Com exatamente dois participantes é um confronto:
 * "A × B", na ordem do confronto. Com qualquer outro número (nenhum, um, ou
 * três ou mais, como numa corrida, que não é confronto) vale o texto livre que
 * o bar escreveu e, com ele em branco, o nome do campeonato. Decisão do dono
 * em 24/10/2026.
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

/** Os nomes dos participantes do jogo, na ordem em que vieram. */
export function participantNames(
  game: Pick<TitledGame, 'participants'>
): string[] {
  return game.participants.flatMap((participant) => {
    const name =
      typeof participant === 'string' ? participant : participant.team?.name
    return name ? [name] : []
  })
}

/**
 * Os dois lados do confronto, para a tela que põe um de cada lado (escudos,
 * ticket do código). `null` quando o jogo não tem exatamente dois.
 */
export function matchSides(
  game: Pick<TitledGame, 'participants'>
): [string, string] | null {
  const names = participantNames(game)
  return names.length === 2 ? [names[0] as string, names[1] as string] : null
}

/** "Corinthians × Palmeiras"; fora do confronto, o texto livre ou o campeonato. */
export function gameTitle(game: TitledGame): string {
  const sides = matchSides(game)
  if (sides) return sides.join(' × ')
  return game.participantFreeText?.trim() || game.championship
}
