import { firstName } from './explore'
import { matchName, type NearBar } from './search'

/*
 * Avisos (19c do design), montados do que já existe: código validado com
 * oferta, jogo dos seus times perto, conquista desbloqueada, dos amigos,
 * pedido recebido e pedido aceito (`friends.notices`) e, de "Bares pra
 * você" (WEB-425), o jogo novo do bar que você pediu para avisar e o jogo que
 * você pediu para lembrar, no dia. Ranking e comunidade do design ainda não
 * existem no produto. Contas puras; a tela fica em `app/avisos.tsx`.
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
  | { id: string; kind: 'friend-request'; at: string; person: FriendNotice }
  | { id: string; kind: 'friend-accepted'; at: string; person: FriendNotice }
  | {
      id: string
      /** "Avisar" (23e): o bar publicou jogo do seu esporte ou time. */
      kind: 'alert'
      at: string
      eventId: string
      barId: string
      barName: string
      title: string
      startsAt: string
    }
  | {
      id: string
      /** "Lembrar" (23c): o jogo é hoje. */
      kind: 'reminder'
      at: string
      eventId: string
      barId: string
      barName: string
      title: string
    }

type BarGame = {
  eventId: string
  barId: string
  barName: string
  startsAt: string
  championship: string
  participants: string[]
  participantFreeText: string | null
}

const barGameTitle = (game: BarGame) =>
  game.participants.join(' × ') || game.participantFreeText || game.championship

/** Uma pessoa de `friends.notices`. */
export type FriendNotice = {
  id: string
  name: string
  image?: string | null
  at: string
  mutual: number
  mutualInitials: string[]
}

export type NoticeTab = 'all' | 'games' | 'friends'

/** As abas do design: Tudo, Jogos e Amigos. Conquista só aparece em Tudo. */
export const inTab = (notice: Notice, tab: NoticeTab) =>
  tab === 'all' ||
  (tab === 'friends'
    ? notice.kind === 'friend-request' || notice.kind === 'friend-accepted'
    : notice.kind === 'offer' ||
      notice.kind === 'game' ||
      notice.kind === 'alert' ||
      notice.kind === 'reminder')

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
    /** `friends.notices`: pedido recebido não vence, aceito vale 30 dias. */
    friends?: { requests: FriendNotice[]; accepted: FriendNotice[] }
    /** `recommendations.notices`: Avisar e Lembrar. */
    alerts?: (BarGame & { publishedAt: string })[]
    reminders?: BarGame[]
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
  for (const person of input.friends?.requests ?? [])
    notices.push({
      id: `friend-request:${person.id}`,
      kind: 'friend-request',
      at: person.at,
      person
    })
  for (const person of input.friends?.accepted ?? [])
    if (new Date(person.at).getTime() >= old)
      notices.push({
        id: `friend-accepted:${person.id}`,
        kind: 'friend-accepted',
        at: person.at,
        person
      })
  for (const game of input.alerts ?? [])
    notices.push({
      id: `alert:${game.eventId}`,
      kind: 'alert',
      at: game.publishedAt,
      eventId: game.eventId,
      barId: game.barId,
      barName: game.barName,
      title: barGameTitle(game),
      startsAt: game.startsAt
    })
  // O lembrete só aparece no dia do jogo.
  for (const game of input.reminders ?? [])
    if (dayKey(game.startsAt) === dayKey(now))
      notices.push({
        id: `reminder:${game.eventId}`,
        kind: 'reminder',
        at: game.startsAt,
        eventId: game.eventId,
        barId: game.barId,
        barName: game.barName,
        title: barGameTitle(game)
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

const twoLetters = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word[0] ?? ''))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('pt-BR')

/**
 * O rodapé do "Seu jogo de hoje" (19c): "MC RL +32 Marina e mais 33 vão".
 * Amigos primeiro, pelo primeiro nome (o servidor só manda quem deixa amigos
 * verem); sem amigo, a contagem; abaixo do piso e sem amigo, "Você vai".
 */
export function todayGoing(
  going: {
    count: number | null
    initials: string[]
    friends: { name: string }[]
  } | null
) {
  const friends = going?.friends ?? []
  const count = going?.count ?? null
  const faces = [
    ...friends.map((f) => twoLetters(f.name)),
    ...(going?.initials ?? [])
  ]
    .filter(Boolean)
    .slice(0, 2)
  const first = friends[0] ? firstName(friends[0].name) : ''
  if (!friends.length)
    return count === null
      ? { faces: [], more: 0, bold: '', rest: 'Você vai' }
      : {
          faces,
          more: count - faces.length,
          bold: '',
          rest: `${count.toLocaleString('pt-BR')} pessoas vão`
        }
  if (count !== null)
    return {
      faces,
      more: Math.max(count - faces.length, 0),
      bold: first,
      rest:
        count > 1
          ? ` e mais ${(count - 1).toLocaleString('pt-BR')} vão`
          : ' vai'
    }
  const others = friends.length - 1
  const second = friends[1] && firstName(friends[1].name)
  return {
    faces,
    more: Math.max(friends.length - faces.length, 0),
    bold: first,
    rest: !others
      ? ' vai'
      : others === 1
        ? ` e ${second} vão`
        : ` e mais ${others} amigos vão`
  }
}
