import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { hasEventEnded, isEventLive } from '@findsports_oficial/db/event-window'
import type { inferRouterOutputs } from '@trpc/server'

type Outputs = inferRouterOutputs<AppRouter>

/*
 * O Explorar pela régua do dia (rodada 1 do redesign, "a busca começa pelo
 * jogo"): `pubs.gameBoard` traz os jogos de um dia perto de um ponto, cada um
 * com os bares que o passam; `pubs.barsWithoutGame`, os bares sem jogo
 * publicado no dia. As regras são as do web do torcedor
 * (`apps/web/src/domain/explorar.ts`): o jogo que abre, a ordem dos bares, os
 * sem jogo. Sem React, para o teste.
 */

export type BoardGame = Outputs['pubs']['gameBoard']['games'][number]
export type BoardBar = BoardGame['bars'][number]
export type QuietBar = Outputs['pubs']['barsWithoutGame'][number]

/** Um jogo da fileira: o da régua, com o ao vivo já decidido. */
export type RowGame = BoardGame & { live: boolean }

/**
 * Os jogos da fileira: os que não acabaram (num dia que já passou não sobra
 * nenhum), do esporte escolhido, os ao vivo primeiro e depois pela hora.
 */
export function gameRow(
  games: BoardGame[],
  sportSlug: string | null,
  now: number
): RowGame[] {
  return games
    .filter(
      (game) =>
        !hasEventEnded(game, now) &&
        (sportSlug === null || game.sport.slug === sportSlug)
    )
    .map((game) => ({ ...game, live: isEventLive(game, now) }))
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) || a.startsAt.localeCompare(b.startsAt)
    )
}

/** O jogo que a folha mostra: o escolhido, senão o primeiro da fileira. */
export function chosenGame(
  row: RowGame[],
  key: string | null
): RowGame | undefined {
  return row.find((game) => game.key === key) ?? row[0]
}

/**
 * Os bares do jogo com as características pedidas, como na ordem padrão do
 * web: o Elite do clássico na frente (WEB-130), depois o mais perto.
 */
export function barsOfGame(
  game: BoardGame | undefined,
  amenities: number[]
): BoardBar[] {
  if (!game) return []
  const elite = (bar: BoardBar) => Number(bar.elite && bar.classic !== null)
  return game.bars
    .filter((bar) => amenities.every((id) => bar.amenities.includes(id)))
    .sort((a, b) => elite(b) - elite(a) || a.distanceKm - b.distanceKm)
}

/** Os sem jogo com as características pedidas, fora os que passam o jogo. */
export function quietBars(
  bars: QuietBar[],
  amenities: number[],
  shown: BoardBar[]
): QuietBar[] {
  const ids = new Set(shown.map((bar) => bar.barId))
  return bars
    .filter(
      (bar) =>
        !ids.has(bar.barId) &&
        amenities.every((id) => bar.amenities.includes(id))
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

/** Quantos bares diferentes passam algum jogo da fileira (os filtros). */
export function barCount(row: RowGame[], amenities: number[]): number {
  return new Set(
    row.flatMap((game) => barsOfGame(game, amenities).map((bar) => bar.barId))
  ).size
}

/** "450 m" ou "1,2 km", como o web. */
export function distance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'short'
})

/** A fileira de dias: hoje e os três seguintes ("Hoje", "Seg 9", "Ter 10"). */
/** Os dias da fileira com o escolhido no fim, se ele não está nela. */
export function withChosenDay(
  days: { day: string; label: string }[],
  chosen: string | null
) {
  if (!chosen || days.some((d) => d.day === chosen)) return days
  const at = new Date(`${chosen}T12:00:00.000Z`)
  const week = WEEKDAY.format(at).replace('.', '')
  return [
    ...days,
    {
      day: chosen,
      label: `${week.charAt(0).toUpperCase()}${week.slice(1, 3)} ${at.getUTCDate()}`
    }
  ]
}

export function dayChoices(today: string): { day: string; label: string }[] {
  return [0, 1, 2, 3].map((n) => {
    const at = new Date(`${today}T12:00:00.000Z`)
    at.setUTCDate(at.getUTCDate() + n)
    const day = at.toISOString().slice(0, 10)
    if (n === 0) return { day, label: 'Hoje' }
    const week = WEEKDAY.format(at).replace('.', '')
    return {
      day,
      label: `${week.charAt(0).toUpperCase()}${week.slice(1, 3)} ${at.getUTCDate()}`
    }
  })
}
