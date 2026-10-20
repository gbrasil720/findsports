import { matchName, type NearBar } from './search'

/*
 * Avisos (19c do design), montados do que já existe: código validado com
 * oferta, jogo dos seus times perto e conquista desbloqueada. Pedido de
 * amizade, ranking e comunidade do design ainda não existem no produto.
 * Contas puras; a tela fica em `app/avisos.tsx`.
 */

const TZ = 'America/Sao_Paulo'
const DAY = 86_400_000

export type Notice =
  | {
      id: string
      kind: 'offer'
      at: string
      eventId: string
      barName: string
      offer: string
    }
  | {
      id: string
      kind: 'game'
      at: string
      title: string
      bars: number
      sides: [string, string] | null
    }
  | { id: string; kind: 'medal'; at: string; medalId: string }

type MyGame = {
  eventId: string
  barName: string
  startsAt: string
  offer: string | null
  validated: boolean
}

type Medal = { id: string; unlockedAt: string | null }

const dayKey = (date: string | number) =>
  new Date(date).toLocaleDateString('en-CA', { timeZone: TZ })

/** Até 30 dias para trás; jogos dos seus times, até sete dias à frente. */
export function buildNotices(
  input: {
    mine: MyGame[]
    medals: Medal[]
    /** Os bares perto com jogo dos times da pessoa (`pubs.search` com `teamIds`). */
    teamBars: NearBar[]
    sides: (game: NonNullable<NearBar['nextEvent']>) => [string, string] | null
  },
  now: number
): Notice[] {
  const old = now - 30 * DAY
  const notices: Notice[] = []
  for (const game of input.mine) {
    const at = new Date(game.startsAt).getTime()
    if (game.validated && game.offer && at >= old && at <= now)
      notices.push({
        id: `offer:${game.eventId}`,
        kind: 'offer',
        at: game.startsAt,
        eventId: game.eventId,
        barName: game.barName,
        offer: game.offer
      })
  }
  for (const medal of input.medals) {
    if (!medal.unlockedAt) continue
    const at = new Date(medal.unlockedAt).getTime()
    if (at >= old)
      notices.push({
        id: `medal:${medal.id}`,
        kind: 'medal',
        at: medal.unlockedAt,
        medalId: medal.id
      })
  }
  const games = new Map<
    string,
    { at: string; bars: number; game: NonNullable<NearBar['nextEvent']> }
  >()
  for (const bar of input.teamBars) {
    const game = bar.nextEvent
    if (!game) continue
    const at = new Date(game.startsAt).getTime()
    if (at < now || at > now + 7 * DAY) continue
    const key = `${matchName(game)}|${game.startsAt}`
    const entry = games.get(key) ?? { at: game.startsAt, bars: 0, game }
    entry.bars += 1
    games.set(key, entry)
  }
  for (const [key, entry] of games)
    notices.push({
      id: `game:${key}`,
      kind: 'game',
      at: entry.at,
      title: matchName(entry.game),
      bars: entry.bars,
      sides: input.sides(entry.game)
    })
  return notices.sort(
    (a, b) =>
      Math.abs(new Date(a.at).getTime() - now) -
      Math.abs(new Date(b.at).getTime() - now)
  )
}

/** "Hoje" para o dia de hoje; o resto em "Esta semana" ou "Antes". */
export function noticeSections(notices: Notice[], now: number) {
  const today = dayKey(now)
  const sections: { key: string; title: string; items: Notice[] }[] = [
    { key: 'today', title: 'Hoje', items: [] },
    { key: 'week', title: 'Esta semana', items: [] },
    { key: 'before', title: 'Antes', items: [] }
  ]
  for (const notice of notices) {
    const t = new Date(notice.at).getTime()
    const index =
      dayKey(notice.at) === today ? 0 : Math.abs(t - now) <= 7 * DAY ? 1 : 2
    sections[index]?.items.push(notice)
  }
  return sections.filter((s) => s.items.length)
}

/** A hora para o que é de hoje; o dia da semana para o resto ("QUA"). */
export function noticeTime(at: string, now: number) {
  if (dayKey(at) === dayKey(now))
    return new Date(at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TZ
    })
  // Mais de seis dias: o dia da semana confundiria, vai a data ("12 OUT").
  const far = Math.abs(new Date(at).getTime() - now) > 6 * DAY
  return new Date(at)
    .toLocaleDateString(
      'pt-BR',
      far
        ? { day: 'numeric', month: 'short', timeZone: TZ }
        : { weekday: 'short', timeZone: TZ }
    )
    .replace(/\.| de/g, '')
    .toLocaleUpperCase('pt-BR')
}

/** "começa em 2h28", "começa em 12 min" ou "rolando agora". */
export function startsIn(startsAt: string, now: number) {
  const minutes = Math.round((new Date(startsAt).getTime() - now) / 60_000)
  if (minutes <= 0) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return `${h}h${String(minutes % 60).padStart(2, '0')}`
}
