import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'

/**
 * "Meus jogos": onde o torcedor marcou "Vou assistir aqui", com o código do
 * balcão nos bares Elite. Substituiu "Minhas reservas" quando a reserva de
 * mesa saiu do produto (16/10/2026).
 */

export type MyGame = inferRouterOutputs<AppRouter>['attendance']['mine'][number]

export const BAR_OFF_AIR_MESSAGE = 'Este bar não está mais na Onside.'

const BAR_OFF_AIR_CODE_VALID = `${BAR_OFF_AIR_MESSAGE} Seu código continua valendo: mostre no balcão.`

/** Aviso de bar fora do ar; `null` com o bar no ar (WEB-360). */
export function getOffAirNotice(
  game: Pick<MyGame, 'barActive' | 'code' | 'validated'>
): string | null {
  if (game.barActive) return null
  return game.code && !game.validated
    ? BAR_OFF_AIR_CODE_VALID
    : BAR_OFF_AIR_MESSAGE
}

/**
 * O que `/pub/<id>` mostra de um bar fora do ar a quem marcou jogo lá; `null`
 * com o bar no ar ou sem jogo nele. Com mais de um jogo, vale o aviso do que
 * ainda tem código.
 */
export function getOffAirBar(
  games: MyGame[] | undefined,
  barId: string
): { name: string; notice: string } | null {
  const own = (games ?? []).filter(
    (game) => game.barId === barId && !game.barActive
  )
  const [first] = own
  if (!first) return null
  return {
    name: first.barName,
    notice:
      own
        .map(getOffAirNotice)
        .find((notice) => notice !== BAR_OFF_AIR_MESSAGE) ?? BAR_OFF_AIR_MESSAGE
  }
}

/** O estado do jogo que já passou, como no design ("Validado"...). */
export function pastLabel(game: Pick<MyGame, 'validated' | 'missed'>) {
  if (game.validated) return 'Validado'
  if (game.missed) return 'Não validado'
  return 'Jogo encerrado'
}

/** "A7K·29": o código em dois blocos, mais fácil de ditar no balcão. */
export function formatCode(code: string) {
  return `${code.slice(0, 3)}·${code.slice(3)}`
}
