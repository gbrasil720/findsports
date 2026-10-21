/**
 * Telão e som do jogo, por jogo (WEB-399). O jogo nasce com o que o bar
 * declarou nas características (tem telão, o jogo passa no telão; idem som),
 * e o dono desmarca jogo a jogo no "Novo evento". Coluna nula, como a dos
 * jogos anteriores ao campo, herda das características.
 */
export const SCREEN_AMENITY_ID = 1
export const SOUND_AMENITY_ID = 2

export function resolveEventScreen(
  game: { onBigScreen: boolean | null; withSound: boolean | null },
  amenities: readonly number[]
) {
  return {
    onBigScreen: game.onBigScreen ?? amenities.includes(SCREEN_AMENITY_ID),
    withSound: game.withSound ?? amenities.includes(SOUND_AMENITY_ID)
  }
}
