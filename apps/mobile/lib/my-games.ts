import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  isWithinValidationWindow,
  BRASILIA_TIME_ZONE as TZ
} from '@findsports_oficial/db/event-window'
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
 * "Desmarcado" do design: desmarcar apaga a presença, sem registro. O
 * check-in (WEB-408) confirma a presença mesmo sem o código validado.
 */
export function pastLabel(
  game: Pick<MyGame, 'validated' | 'missed' | 'visited'>
) {
  if (game.validated) return 'Validado'
  if (game.visited) return 'Presença confirmada'
  if (game.missed) return 'Não validado'
  return 'Jogo encerrado'
}

/**
 * "Estou aqui" (WEB-408) na linha do jogo: a mesma janela que o servidor
 * confere (3 h antes a 3 h depois do fim) e o bar no ar. A distância só o
 * servidor sabe; feito, o card fica com "Presença confirmada" até a janela
 * fechar.
 */
export function showsCheckIn(
  game: Pick<MyGame, 'startsAt' | 'endsAt' | 'barActive'>,
  now: number
) {
  return game.barActive && isWithinValidationWindow(game, new Date(now))
}

/** "4 out": o dia do jogo na lista dos anteriores. */
export function shortDate(date: string | Date) {
  return new Date(date)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: TZ
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
      timeZone: TZ
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
    timeZone: TZ,
    location: [game.barName, game.neighborhood].filter(Boolean).join(', '),
    notes: notes.length ? notes.join('\n') : undefined,
    alarms: [{ relativeOffset: -60 }]
  }
}

/**
 * O código do jogo de hoje (WEB-466), o que a manutenção e a falta de rede
 * ainda abrem: janela de validação aberta (ou por abrir), o que falta
 * validar antes do validado, e o jogo mais cedo. `null` sem nenhum.
 */
export function pickTodayCode<
  G extends Pick<MyGame, 'code' | 'validated' | 'window' | 'startsAt'>
>(games: readonly G[], now: number): G | null {
  const open = games.filter(
    (game) =>
      game.code && game.window && new Date(game.window.closesAt).getTime() > now
  )
  open.sort(
    (a, b) =>
      Number(a.validated) - Number(b.validated) ||
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )
  return open[0] ?? null
}

/**
 * A tela de fora do Flip sem jogo marcado (Adaptativo 10): o jogo de hoje
 * que mais bares perto passam ("Corinthians × Palmeiras às 21:30 em 5 bares
 * perto."). Empate: o que começa antes.
 */
export function todayHeadline(games: { title: string; startsAt: string }[]) {
  const count = new Map<string, number>()
  for (const game of games) {
    const key = `${game.startsAt}\n${game.title}`
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const [best] = [...count].sort(
    ([a, x], [b, y]) => y - x || a.localeCompare(b)
  )
  if (!best) return null
  const [startsAt, title] = best[0].split('\n')
  return { title, startsAt, bars: best[1] }
}

/** "2026-11-08": o dia em Brasília. */
const brasiliaDate = (at: string | number) =>
  new Date(at).toLocaleDateString('en-CA', { timeZone: TZ })

/** "hoje", "amanhã", "sáb 14": o dia curto embaixo da hora (rodada 4). */
export function dayShort(startsAt: string, now: number) {
  const day = brasiliaDate(startsAt)
  if (day === brasiliaDate(now)) return 'hoje'
  if (day === brasiliaDate(now + 86_400_000)) return 'amanhã'
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Date(startsAt).toLocaleDateString('pt-BR', { ...options, timeZone: TZ })
  return `${part({ weekday: 'short' }).replace('.', '')} ${part({ day: 'numeric' })}`
}

/**
 * A semana do jogo, de domingo a sábado em Brasília: 0 é esta, 1 a
 * próxima, 2 ou mais "mais pra frente".
 */
export function weekOffset(startsAt: string, now: number) {
  const noon = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`)
  const today = noon(brasiliaDate(now))
  const weekStart = today - new Date(today).getUTCDay() * 86_400_000
  const day = noon(brasiliaDate(startsAt))
  return Math.floor((day - weekStart) / (7 * 86_400_000))
}

/** "outubro e novembro": os meses dos jogos, do mais antigo ao mais novo. */
export function monthsLabel(games: { startsAt: string }[]) {
  const seen: string[] = []
  for (const game of [...games].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  )) {
    const month = new Date(game.startsAt).toLocaleDateString('pt-BR', {
      month: 'long',
      timeZone: TZ
    })
    if (!seen.includes(month)) seen.push(month)
  }
  return seen.length > 1
    ? `${seen.slice(0, -1).join(', ')} e ${seen.at(-1)}`
    : (seen[0] ?? '')
}
