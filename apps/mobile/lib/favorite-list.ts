/*
 * A lista de Favoritos (2m do design): a ordem e o jogo de cada bar. Contas
 * puras; a tela fica em `app/(fan)/favoritos.tsx`.
 */

type Favorite = {
  bar: {
    name: string
    latitude: string | number | null
    longitude: string | number | null
    events: { startsAt: string | Date; endsAt: string | Date | null }[]
  }
}

/** O jogo que o cartão mostra: o que está passando, senão o próximo. */
export const nextGame = <F extends Favorite>(favorite: F) =>
  favorite.bar.events[0] as F['bar']['events'][number] | undefined

const coords = (f: Favorite) =>
  f.bar.latitude === null || f.bar.longitude === null
    ? null
    : { lat: Number(f.bar.latitude), lng: Number(f.bar.longitude) }

/**
 * "Próximo jogo": o que está passando ou começa antes vem primeiro, e bar
 * sem jogo marcado vai para o fim. "Distância": do mais perto ao mais longe.
 * Empate pelo nome, para a ordem não pular entre uma leitura e outra.
 */
export function sortFavorites<F extends Favorite>(
  list: F[],
  by: 'game' | 'distance',
  from: { lat: number; lng: number },
  distance: (
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ) => number
) {
  const key = (f: F) => {
    if (by === 'distance') {
      const at = coords(f)
      return at ? distance(from, at) : Number.POSITIVE_INFINITY
    }
    const game = nextGame(f)
    return game ? new Date(game.startsAt).getTime() : Number.POSITIVE_INFINITY
  }
  return [...list].sort(
    (a, b) => key(a) - key(b) || a.bar.name.localeCompare(b.bar.name, 'pt-BR')
  )
}
