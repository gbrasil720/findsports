import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import type { inferRouterOutputs } from '@trpc/server'

/*
 * "Vou assistir" (08 do design): Meus jogos, o código do balcão e o
 * pós-jogo. Contas puras; as telas ficam em `app/`.
 */

export type MyGame = inferRouterOutputs<AppRouter>['attendance']['mine'][number]

/** "A7K·29": o código em dois blocos, mais fácil de ditar no balcão. */
export const formatCode = (code: string) =>
  `${code.slice(0, 3)}·${code.slice(3)}`

/**
 * Como o jogo que passou terminou, como no design ("Validado"...). Sem o
 * "Desmarcado" do design: desmarcar apaga a presença, sem registro.
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

/**
 * O jogo como evento da agenda do celular (WEB-406): título com o bar, o
 * fim que o servidor resolveu, o código e a oferta nas notas, e um aviso
 * uma hora antes.
 */
export function calendarEvent(
  game: Pick<
    MyGame,
    | 'participants'
    | 'participantFreeText'
    | 'championship'
    | 'barName'
    | 'neighborhood'
    | 'startsAt'
    | 'endsAt'
    | 'code'
    | 'offer'
  >
) {
  const notes = [
    game.code ? `Código no balcão: ${formatCode(game.code)}` : null,
    game.offer ? `Oferta da casa: ${game.offer}` : null
  ].filter(Boolean)
  return {
    title: `${gameTitle(game)} no ${game.barName}`,
    startDate: new Date(game.startsAt),
    endDate: new Date(game.endsAt),
    timeZone: 'America/Sao_Paulo',
    location: [game.barName, game.neighborhood].filter(Boolean).join(', '),
    notes: notes.length ? notes.join('\n') : undefined,
    alarms: [{ relativeOffset: -60 }]
  }
}
