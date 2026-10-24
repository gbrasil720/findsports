import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle, matchSides } from '@findsports_oficial/db/game-title'
import { isLive } from './explore'

/*
 * Busca (19a e 19b do design): contas puras sobre os bares perto que a
 * `pubs.search` devolve. A tela fica em `app/busca.tsx`.
 */

type Game = {
  startsAt: string
  endsAt: string | null
  championship: string
  participants: { team: { name: string } }[]
  participantFreeText: string | null
  sport: { name: string; slug: string }
}

export type NearBar = {
  id: string
  name: string
  neighborhood: string
  latitude: string | number
  longitude: string | number
  photo_url: string | null
  distance_km: number
  plan?: string | null
  nextEvent?: Game
}

/** Sem acento e sem caixa, para comparar o que a pessoa digita. */
export const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()

/** Os dois lados do jogo: os times, senão o texto livre partido no "×". */
export function sides(game: Game): [string, string] | null {
  const two = matchSides(game)
  if (two) return two
  const parts = game.participantFreeText?.split(/\s+[×x]\s+/i)
  return parts?.length === 2 ? [parts[0] as string, parts[1] as string] : null
}

/**
 * O título do jogo (`gameTitle`), com o texto livre "A x B" escrito como
 * "A × B": o mesmo jogo digitado de dois jeitos agrupa junto na busca.
 */
export function matchName(game: Game) {
  const two = sides(game)
  return two ? `${two[0]} × ${two[1]}` : gameTitle(game)
}

type Grouped<B extends NearBar> = {
  key: string
  game: Game
  bars: B[]
}

/** O mesmo jogo em vários bares conta uma vez, com os bares do mais perto. */
function byMatch<B extends NearBar>(bars: B[]): Grouped<B>[] {
  const groups = new Map<string, Grouped<B>>()
  for (const bar of bars) {
    const game = bar.nextEvent
    if (!game) continue
    const key = `${fold(matchName(game))}|${game.startsAt}`
    const group = groups.get(key) ?? { key, game, bars: [] }
    group.bars.push(bar)
    groups.set(key, group)
  }
  for (const group of groups.values())
    group.bars.sort((a, b) => a.distance_km - b.distance_km)
  return [...groups.values()]
}

/** "Rolando agora": o jogo ao vivo em mais bares perto. */
export function liveNow<B extends NearBar>(bars: B[], now: number) {
  return (
    byMatch(bars.filter((b) => b.nextEvent && isLive(b.nextEvent, now))).sort(
      (a, b) => b.bars.length - a.bars.length
    )[0] ?? null
  )
}

const dayOf = (date: string | number) => brasiliaDay(date)

/** "Hoje à noite": os jogos de hoje que ainda não começaram, pela hora. */
export function tonight<B extends NearBar>(bars: B[], now: number) {
  return byMatch(
    bars.filter(
      (b) =>
        b.nextEvent &&
        new Date(b.nextEvent.startsAt).getTime() > now &&
        dayOf(b.nextEvent.startsAt) === dayOf(now)
    )
  ).sort(
    (a, b) =>
      new Date(a.game.startsAt).getTime() - new Date(b.game.startsAt).getTime()
  )
}

export type Hood<B extends NearBar> = {
  name: string
  bars: B[]
  /** Com jogo rolando agora. */
  live: number
}

/** "Por bairro": os bairros com mais bares perto. */
export function hoods<B extends NearBar>(bars: B[], now: number): Hood<B>[] {
  const groups = new Map<string, Hood<B>>()
  for (const bar of bars) {
    const name = bar.neighborhood.trim()
    if (!name) continue
    const hood = groups.get(fold(name)) ?? { name, bars: [], live: 0 }
    hood.bars.push(bar)
    if (bar.nextEvent && isLive(bar.nextEvent, now)) hood.live += 1
    groups.set(fold(name), hood)
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.bars.length - a.bars.length || a.name.localeCompare(b.name, 'pt-BR')
  )
}

/**
 * O que a pessoa digitou casa com: o bairro (melhor resultado), e os bares
 * pelo nome, pelo bairro ou pelo jogo. Palavras soltas casam todas.
 */
export function matchQuery<B extends NearBar>(
  bars: B[],
  query: string,
  now: number
) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const has = (text: string) => words.every((w) => fold(text).includes(w))
  if (!words.length) return { hood: null, bars: [] as B[] }
  const hood = hoods(bars, now).find((h) => has(h.name)) ?? null
  const found = bars.filter(
    (b) =>
      has(b.name) ||
      has(b.neighborhood) ||
      (b.nextEvent &&
        has(`${matchName(b.nextEvent)} ${b.nextEvent.championship}`))
  )
  return { hood, bars: found }
}

/** As partes do texto que casam com a busca, para o marca-texto acid. */
export function highlight(text: string, query: string) {
  const q = fold(query)
  if (!q) return [{ text, hit: false }]
  // `fold` não muda o tamanho de letras latinas: o índice vale no original.
  const at = fold(text).indexOf(q)
  if (at < 0) return [{ text, hit: false }]
  return [
    { text: text.slice(0, at), hit: false },
    { text: text.slice(at, at + q.length), hit: true },
    { text: text.slice(at + q.length), hit: false }
  ].filter((part) => part.text)
}

/** Buscas recentes: a mais nova primeiro, sem repetir, até seis. */
export function rememberSearch(list: string[], query: string) {
  const q = query.trim()
  if (!q) return list
  return [q, ...list.filter((item) => fold(item) !== fold(q))].slice(0, 6)
}
