import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'

/*
 * "Vou assistir" (08 do design): Meus jogos, o código do balcão e o
 * pós-jogo. Contas puras; as telas ficam em `app/`.
 */

export type MyGame = inferRouterOutputs<AppRouter>['attendance']['mine'][number]

/** "A7K·29": o código em dois blocos, mais fácil de ditar no balcão. */
export const formatCode = (code: string) =>
  `${code.slice(0, 3)}·${code.slice(3)}`

/** "Corinthians × Palmeiras", senão o texto livre, senão o campeonato. */
export function gameTitle(game: {
  participants: string[]
  participantFreeText: string | null
  championship: string
}) {
  return (
    game.participants.join(' × ') ||
    game.participantFreeText ||
    game.championship
  )
}

/**
 * Como o jogo que passou terminou, como no design ("Validado"...). Falta
 * "Desmarcado": desmarcar apaga a presença (WEB-405).
 */
export function pastLabel(game: Pick<MyGame, 'validated' | 'missed'>) {
  if (game.validated) return 'Validado'
  if (game.missed) return 'Não validado'
  return 'Jogo encerrado'
}

/** "4 out": o dia do jogo na lista dos anteriores. */
export function shortDate(date: string | Date) {
  return new Date(date)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Sao_Paulo'
    })
    .replace(/\.$/, '')
    .replace(' de ', ' ')
}

/** "5 em outubro": quantos dos anteriores foram no mês corrente. */
export function thisMonth(games: { startsAt: string | Date }[], now: number) {
  const month = (date: string | Date | number) =>
    new Date(date).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    })
  const current = month(now)
  const count = games.filter((game) => month(game.startsAt) === current).length
  return count ? `${count} em ${current.split(' ')[0]}` : null
}
