/**
 * Um jogo na faixa de placar da manutenção (rodada 7): "FLA × PAL 21:30",
 * "COR × BAH AO VIVO". Confronto vira as três letras de cada lado; o resto
 * (corrida, texto livre) vai como está, em maiúsculas.
 */
/** "Fla × Pal": as três letras de cada lado; corrida e texto livre inteiros. */
export function shortTitle(title: string) {
  const sides = title.split(' × ')
  if (sides.length !== 2) return title
  return sides
    .map((side) => {
      const three = side
        .normalize('NFD')
        .replace(/[^\p{L}]/gu, '')
        .slice(0, 3)
      return (
        three.charAt(0).toLocaleUpperCase('pt-BR') +
        three.slice(1).toLocaleLowerCase('pt-BR')
      )
    })
    .join(' × ')
}

export function tickerItem(
  game: { title: string; startsAt: string; live: boolean },
  formatTime: (iso: string) => string
) {
  const name = shortTitle(game.title)
  return `${name.toLocaleUpperCase('pt-BR')} ${game.live ? 'AO VIVO' : formatTime(game.startsAt)}`
}
