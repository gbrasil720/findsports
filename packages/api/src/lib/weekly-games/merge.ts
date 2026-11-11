import { fold } from '@findsports_oficial/db/catalog/fold'
import {
  brasiliaDay,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'
import type { WeeklyGameSource } from '@findsports_oficial/db/schema/weekly-games'

/*
 * Contas puras dos jogos da semana (WEB-433): semana de Brasília, chave do
 * mesmo jogo em fontes diferentes, canais com nome único, junção e o teto de
 * gasto. Sem banco nem rede: `catalog.ts` usa, os testes conferem.
 */

/** Um jogo achado por uma fonte, antes de juntar. */
export type FoundGame = {
  sportId: string
  championship: string
  /** "Mandante x Visitante", ou o nome do evento quando não é confronto. */
  name: string
  /** Dia de Brasília ("2026-11-14") e o instante do início. */
  day: string
  startsAt: Date
  channels: string[]
  source: WeeklyGameSource
}

export type MergedGame = Omit<FoundGame, 'source'> & {
  key: string
  sides: [string, string] | null
  channelConfirmed: boolean
  sources: WeeklyGameSource[]
}

/** A semana de Brasília de `now`: a segunda, os sete dias e o dia da semana (0 = domingo). */
export function brasiliaWeekOf(now: Date) {
  const today = brasiliaDay(now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const monday = brasiliaDay(`${today}T12:00:00Z`, -((weekday + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) =>
    brasiliaDay(`${monday}T12:00:00Z`, i)
  )
  return { monday, days, weekday, today }
}

/** "14/11" */
export const dayMonth = (day: string) =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** O instante de "HH:MM" no dia `day` de Brasília. */
export function brasiliaStart(day: string, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const [h, m] = [Number(match[1]), Number(match[2])]
  if (h > 23 || m > 59) return null
  return new Date(brasiliaDayStart(day).getTime() + (h * 60 + m) * 60_000)
}

/** Os dois lados de "A x B" (também "×" e "vs"); nulo fora de confronto. */
export function splitSides(name: string): [string, string] | null {
  const parts = name.split(/\s+(?:x|×|vs\.?|versus)\s+/i).map((p) => p.trim())
  return parts.length === 2 && parts[0] && parts[1]
    ? [parts[0], parts[1]]
    : null
}

/** Palavras que não dizem qual é o time ("FC", "Clube"). */
const NOISE = new Set(['afc', 'club', 'clube', 'esporte', 'sport', 'futebol'])

/**
 * O mesmo jogo em fontes diferentes: dia e o começo do nome de cada lado, sem
 * acento, em ordem alfabética (mando invertido continua o mesmo jogo).
 */
export function gameKey(day: string, name: string) {
  const sides = splitSides(name) ?? [name]
  const parts = sides
    .map((side) =>
      fold(side)
        .split(/[^a-z]+/)
        .filter((w) => w.length > 2 && !NOISE.has(w))
        .join('')
        .slice(0, 5)
    )
    .sort()
  return `${day}|${parts.join('-')}`
}

/** Nome único de cada canal; o que não é canal ("TV aberta") sai. */
const CHANNEL_ALIASES: [RegExp, string | null][] = [
  [/^(amazon( prime( video)?)?|prime video|prime)$/, 'Prime Video'],
  [/^(globo|tv globo|rede globo)$/, 'Globo'],
  [/^sportv\s*\d*$/, 'SporTV'],
  [/^premiere( fc)?$/, 'Premiere'],
  [/^(ge ?tv|getv)$/, 'GE TV'],
  [/^globoplay$/, 'Globoplay'],
  [/^espn\s*\d*$/, 'ESPN'],
  [/^(disney\+?|disney plus|star\+)$/, 'Disney+'],
  [/^(caze ?tv|youtube \(caze ?tv\))$/, 'CazéTV'],
  [/^(record( tv)?|recordtv)$/, 'Record'],
  [/^redetv!?$/, 'RedeTV!'],
  [/^sbt$/, 'SBT'],
  [/^(band|tv band|bandeirantes)$/, 'Band'],
  [/^(paramount\+?|paramount plus)$/, 'Paramount+'],
  [/^(max|hbo max)$/, 'Max'],
  [/^tnt( sports)?$/, 'TNT Sports'],
  [/^(tv aberta|tv fechada|streaming|a definir|nao definido|indefinido)$/, null]
]

export function normalizeChannels(raw: readonly string[]): string[] {
  const out: string[] = []
  for (const piece of raw.flatMap((c) => c.split(/\s*[/,]\s*|\s+e\s+/))) {
    const name = piece.trim()
    if (!name) continue
    const key = fold(name)
    const hit = CHANNEL_ALIASES.find(([re]) => re.test(key))
    const canonical = hit ? hit[1] : name
    if (canonical && !out.includes(canonical)) out.push(canonical)
  }
  return out
}

/**
 * Junta as fontes: o primeiro que trouxe o jogo dá a hora (o calendário vem
 * antes da busca, por isso ele ganha), os canais de todas somam (no
 * protótipo, a segunda fonte trazia o canal que faltava) e toda fonte fica
 * guardada.
 */
export function mergeGames(found: readonly FoundGame[]): MergedGame[] {
  const games = new Map<string, MergedGame>()
  for (const game of found) {
    const key = gameKey(game.day, game.name)
    const channels = normalizeChannels(game.channels)
    const source = { ...game.source, channels }
    const prev = games.get(key)
    if (!prev) {
      const { source: _source, ...rest } = game
      games.set(key, {
        ...rest,
        key,
        sides: splitSides(game.name),
        channels,
        channelConfirmed: false,
        sources: [source]
      })
      continue
    }
    for (const channel of channels)
      if (!prev.channels.includes(channel)) prev.channels.push(channel)
    prev.sources.push(source)
  }
  return markConfirmation([...games.values()])
}

/** Uma página que dá a mesma lista a tantos jogos do campeonato fala da competição. */
const ROUND_WIDE_MIN_GAMES = 3

/**
 * Canal confirmado: há canal, e alguma fonte o deu sem ser a lista da
 * competição. Página de agregação que põe todas as emissoras em todo jogo da
 * rodada (a 38ª da Série B no protótipo) não confirma nada: o dono confere.
 */
export function markConfirmation(games: MergedGame[]): MergedGame[] {
  const perPage = new Map<string, Map<string, number>>()
  for (const game of games)
    for (const source of game.sources) {
      if (!source.url || !source.channels.length) continue
      const page = `${game.championship}|${source.url}`
      const lists = perPage.get(page) ?? new Map<string, number>()
      const list = [...source.channels].sort().join(',')
      lists.set(list, (lists.get(list) ?? 0) + 1)
      perPage.set(page, lists)
    }
  const roundWide = (championship: string, source: WeeklyGameSource) => {
    if (!source.url) return false
    const lists = perPage.get(`${championship}|${source.url}`)
    if (!lists || lists.size !== 1) return false
    return (lists.values().next().value ?? 0) >= ROUND_WIDE_MIN_GAMES
  }
  return games.map((game) => ({
    ...game,
    channelConfirmed:
      game.channels.length > 0 &&
      game.sources.some(
        (s) => s.channels.length > 0 && !roundWide(game.championship, s)
      )
  }))
}

/**
 * A hora extraída aparece no texto? O modelo às vezes "converte" fuso ou erra
 * a leitura (protótipo, erros 4 e 6); hora que a página não escreve sai.
 */
export function hourInPage(page: string, time: string) {
  const [h, m] = time.split(':')
  if (!h || !m) return false
  const hh = h.padStart(2, '0')
  const hours = [...new Set([hh, String(Number(h))])]
  const variants = hours.flatMap((x) => [
    `${x}:${m}`,
    `${x}h${m}`,
    `${x}h ${m}`,
    ...(m === '00' ? [`${x}h`] : [])
  ])
  const text = page.toLowerCase()
  return variants.some((v) => text.includes(v))
}

export class BudgetStop extends Error {
  constructor(spent: number, worst: number, limit: number) {
    super(
      `teto do mês: ${spent.toFixed(4)} + ${worst.toFixed(4)} passaria de US$ ${limit}`
    )
    this.name = 'BudgetStop'
  }
}

/**
 * O teto do mês da rotina. Antes de cada chamada, o pior caso dela tem de
 * caber no que sobra; depois, entra o que ela custou de verdade.
 */
export function createBudget(limitUsd: number, spentBeforeUsd: number) {
  let spent = spentBeforeUsd
  let run = 0
  return {
    guard(worstUsd: number) {
      if (spent + worstUsd > limitUsd)
        throw new BudgetStop(spent, worstUsd, limitUsd)
    },
    add(usd: number) {
      spent += usd
      run += usd
    },
    get runUsd() {
      return run
    },
    get monthUsd() {
      return spent
    }
  }
}
