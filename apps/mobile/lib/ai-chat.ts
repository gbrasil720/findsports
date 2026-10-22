import type {
  ChatBar,
  ChatEvent,
  ConfirmResult,
  FilterChip,
  Proposal,
  Source
} from './ai-events'

/*
 * Contas da busca com IA (Rodada 24, WEB-400) sem tela: os eventos de
 * `ai.converse` montando a resposta, as citações `[[n]]`, as versões do
 * "refazer", os recentes guardados no aparelho, os chips que refazem a busca
 * sem IA, quando o chat volta e o histórico que vai ao servidor.
 */

// --- Resposta montada pelos eventos ----------------------------------------

export type Step = Omit<Extract<ChatEvent, { type: 'step' }>, 'type'>
export type Tool = Omit<Extract<ChatEvent, { type: 'tool' }>, 'type'>
export type Done = Omit<Extract<ChatEvent, { type: 'done' }>, 'type'>

/** O que a pessoa decidiu sobre a proposta (24d → 24e). */
export type Decision =
  | { kind: 'refused'; at: string }
  | { kind: 'sending' }
  | { kind: 'approved'; result: ConfirmResult }

export type Reply = {
  /** `run` enquanto os eventos chegam; `stopped` quando a pessoa parou. */
  state: 'run' | 'done' | 'stopped' | 'limit' | 'unavailable'
  steps: Step[]
  tools: Tool[]
  bars: ChatBar[]
  text: string
  proposal: Proposal | null
  decision: Decision | null
  done: Done | null
  limit: { scope: 'day' | 'month'; resumesAt: string } | null
  startedAt: number
  /** Quando o pensamento acabou (primeiro texto, proposta ou fim). */
  thoughtAt: number | null
  feedback: 1 | -1 | null
  /** Chips que a pessoa tirou (`key`), para refazer a busca sem eles. */
  removed: string[]
}

export const startReply = (now: number): Reply => ({
  state: 'run',
  steps: [],
  tools: [],
  bars: [],
  text: '',
  proposal: null,
  decision: null,
  done: null,
  limit: null,
  startedAt: now,
  thoughtAt: null,
  feedback: null,
  removed: []
})

/** Troca o item de mesmo `id` (atualização) ou acrescenta no fim. */
const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item]

/** Um evento a mais na resposta. Puro: a tela guarda o que volta. */
export function applyEvent(reply: Reply, event: ChatEvent, now: number): Reply {
  const thought = reply.thoughtAt ?? now
  switch (event.type) {
    case 'blocked':
      return event.reason === 'limit'
        ? {
            ...reply,
            state: 'limit',
            limit: { scope: event.scope, resumesAt: event.resumesAt }
          }
        : { ...reply, state: 'unavailable' }
    case 'step': {
      const { type: _, ...step } = event
      return { ...reply, steps: upsert(reply.steps, step) }
    }
    case 'tool': {
      const { type: _, ...tool } = event
      return { ...reply, tools: upsert(reply.tools, tool) }
    }
    case 'bars':
      return { ...reply, bars: event.bars }
    case 'text':
      return { ...reply, text: reply.text + event.text, thoughtAt: thought }
    case 'proposal':
      return { ...reply, proposal: event.proposal, thoughtAt: thought }
    case 'done': {
      const { type: _, ...done } = event
      // Passo que ficou rodando terminou junto com a resposta.
      const steps = reply.steps.map((s) =>
        s.state === 'run' ? { ...s, state: 'done' as const } : s
      )
      return { ...reply, state: 'done', done, steps, thoughtAt: thought }
    }
  }
}

/** Ainda pensando: sem texto e sem proposta (o raciocínio fica aberto). */
export const isThinking = (reply: Reply) =>
  reply.state === 'run' && reply.thoughtAt === null

/** "Pensou por 4 s · 2 buscas" (sem buscas, só o tempo). */
export function thoughtLabel(reply: Reply) {
  const ms =
    reply.done?.thoughtMs ??
    (reply.thoughtAt ?? reply.startedAt) - reply.startedAt
  const seconds = Math.max(1, Math.round(ms / 1000))
  const searches = reply.done?.searches ?? 0
  return `Pensou por ${seconds} s${searches ? ` · ${searches} ${searches === 1 ? 'busca' : 'buscas'}` : ''}`
}

// --- Texto com negrito e citações -------------------------------------------

/** "Achei **Corinthians × Palmeiras** hoje" em pedaços, com o negrito. */
export function boldSegments(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part.replace(/\*\*/g, ''), bold: false }
    )
}

export type Piece = { text: string; bold: boolean } | { cite: number }

/**
 * O texto da resposta em pedaços: negrito e o número acid de cada citação.
 * `[[n]]` fora dos bares (`n` < 1 ou > `count`) sai do texto. Enquanto o
 * texto chega aos pedaços, a marca começada no fim (`[[2`) espera o resto.
 */
export function citationPieces(text: string, count: number): Piece[] {
  const whole = text.replace(/\[\[?\d*\]?$/, '')
  return whole
    .split(/(\[\[\d+\]\])/)
    .filter(Boolean)
    .flatMap((part): Piece[] => {
      const cite = /^\[\[(\d+)\]\]$/.exec(part)
      if (!cite) return boldSegments(part)
      const n = Number(cite[1])
      return n >= 1 && n <= count ? [{ cite: n }] : []
    })
    .filter((p) => !('text' in p) || p.text)
}

/** O texto para copiar e compartilhar: sem as marcas. */
export const plainText = (text: string) =>
  text
    .replace(/\s?\[\[\d+\]\]/g, '')
    .replace(/\*\*/g, '')
    .trim()

// --- Conversa e versões do "refazer" ----------------------------------------

export type Turn = {
  id: number
  question: string
  /** Cada "refazer" acrescenta uma versão; `shown` é a que está na tela. */
  versions: Reply[]
  shown: number
}

export const newTurn = (id: number, question: string, now: number): Turn => ({
  id,
  question,
  versions: [startReply(now)],
  shown: 0
})

/** "Refazer": uma versão nova no fim, já na tela. */
export const redoTurn = (turn: Turn, now: number): Turn => ({
  ...turn,
  versions: [...turn.versions, startReply(now)],
  shown: turn.versions.length
})

/** "‹ 2/2 ›": anda entre as versões, sem passar das pontas. */
export const stepVersion = (turn: Turn, by: -1 | 1): Turn => ({
  ...turn,
  shown: Math.min(turn.versions.length - 1, Math.max(0, turn.shown + by))
})

/** "2/2", só quando a resposta foi refeita. */
export const versionLabel = (turn: Turn) =>
  turn.versions.length > 1 ? `${turn.shown + 1}/${turn.versions.length}` : null

/** Muda a versão `index` do turno (a que está recebendo eventos). */
export const patchVersion = (
  turn: Turn,
  index: number,
  patch: (reply: Reply) => Reply
): Turn => ({
  ...turn,
  versions: turn.versions.map((r, i) => (i === index ? patch(r) : r))
})

export const shownReply = (turn: Turn) => turn.versions[turn.shown]

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Histórico curto que vai junto da pergunta: as últimas trocas respondidas. */
export function chatHistory(
  turns: { question: string; answer: string | null }[],
  max = 6
): ChatTurn[] {
  return turns
    .flatMap((t): ChatTurn[] =>
      t.answer
        ? [
            { role: 'user', content: t.question },
            { role: 'assistant', content: t.answer }
          ]
        : []
    )
    .slice(-max)
}

/** O histórico a partir da conversa: a versão na tela de cada troca. */
export const historyOf = (turns: Turn[]) =>
  chatHistory(
    turns.map((t) => {
      const reply = shownReply(t)
      return {
        question: t.question,
        answer: reply.text ? plainText(reply.text) : null
      }
    })
  )

// --- Recentes (no aparelho) ---------------------------------------------------

export type Recent = {
  id: string
  /** A primeira pergunta. */
  title: string
  at: number
  bars: number
  turns: Turn[]
}

export const MAX_RECENTS = 20

/** A conversa vai para o topo; a mesma conversa substitui a antiga. */
export function saveRecent(list: Recent[], entry: Recent, max = MAX_RECENTS) {
  return [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, max)
}

/** Quantos bares a conversa achou: o maior número de uma resposta. */
export const barsFound = (turns: Turn[]) =>
  Math.max(0, ...turns.map((t) => shownReply(t).bars.length))

const DAY = 86_400_000
const ymd = (value: number) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/** "Hoje", "Ontem", "Seg" (até uma semana) ou "12/10". */
export function recentWhen(at: number, now: number) {
  if (ymd(at) === ymd(now)) return 'Hoje'
  if (ymd(at) === ymd(now - DAY)) return 'Ontem'
  const days = (Date.parse(ymd(now)) - Date.parse(ymd(at))) / DAY
  if (days > 0 && days < 7) {
    const weekday = new Date(at)
      .toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short'
      })
      .replace('.', '')
    return weekday.charAt(0).toLocaleUpperCase('pt-BR') + weekday.slice(1)
  }
  return new Date(at).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit'
  })
}

/** "Ontem · 3 bares". */
export const recentMeta = (recent: Recent, now: number) =>
  `${recentWhen(recent.at, now)} · ${
    recent.bars === 0
      ? 'nenhum bar'
      : `${recent.bars} ${recent.bars === 1 ? 'bar' : 'bares'}`
  }`

// --- Chips que refazem a busca (sem IA) --------------------------------------

type Point = { lat: number; lng: number }

/** Os argumentos de `pubs.search` (os que os chips carregam). */
export type ChipSearch = Point & {
  radiusKm?: number
  sportId?: string
  championship?: string
  date?: string
  amenities?: number[]
  teamIds?: string[]
  limit: number
}

/**
 * A busca dos chips que sobraram, sem IA. A `key` é
 * `<argumento de pubs.search>:<valor>`; `neighborhood:<bairro>` filtra a
 * lista no app e `origin:<lat>,<lng>` é o ponto de partida (senão, o do
 * campo). Sem ponto de partida, não há busca.
 */
export function chipSearch(
  chips: FilterChip[],
  removed: string[],
  fallback: Point | null
): { input: ChipSearch; neighborhood: string | null } | null {
  let origin = fallback
  let neighborhood: string | null = null
  const args: Omit<ChipSearch, 'lat' | 'lng'> = { limit: 20 }
  for (const { key } of chips) {
    if (removed.includes(key)) continue
    const at = key.indexOf(':')
    const arg = key.slice(0, at)
    const value = key.slice(at + 1)
    if (at < 0 || !value) continue
    if (arg === 'origin') {
      const [lat, lng] = value.split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lng))
        origin = { lat: lat as number, lng: lng as number }
    } else if (arg === 'neighborhood') neighborhood = value
    else if (arg === 'amenities')
      args.amenities = [...(args.amenities ?? []), Number(value)]
    else if (arg === 'teamIds') args.teamIds = [...(args.teamIds ?? []), value]
    else if (arg === 'radiusKm') args.radiusKm = Number(value)
    else if (arg === 'date' || arg === 'sportId' || arg === 'championship')
      args[arg] = value
  }
  return origin
    ? { input: { lat: origin.lat, lng: origin.lng, ...args }, neighborhood }
    : null
}

/** Bares do bairro pedido, quando a IA filtrou por bairro. */
export const inNeighborhood = <T extends { neighborhood: string | null }>(
  bars: T[],
  neighborhood: string | null
) =>
  neighborhood
    ? bars.filter((b) =>
        (b.neighborhood ?? '')
          .toLocaleLowerCase('pt-BR')
          .includes(neighborhood.toLocaleLowerCase('pt-BR'))
      )
    : bars

type FoundBar = {
  id: string
  name: string
  neighborhood: string | null
  distance_km: number
  photo_url: string | null
  plan: string | null
  rating: { percentage: number } | null
  averageSpendCents: number | null
  nextEvent?: {
    id: string
    startsAt: string
    endsAt: string | null
    championship: string
    participants: { team: { name: string } }[]
    participantFreeText: string | null
  } | null
}

/** Um bar de `pubs.search` no formato dos cards do chat. */
export function fromSearchBar(
  bar: FoundBar,
  isLive: (game: { startsAt: string; endsAt: string | null }) => boolean
): ChatBar {
  const game = bar.nextEvent
  const names = game?.participants.map((p) => p.team.name) ?? []
  return {
    id: bar.id,
    name: bar.name,
    neighborhood: bar.neighborhood,
    distanceKm: bar.distance_km,
    photoUrl: bar.photo_url,
    plan: bar.plan,
    ratingPercent: bar.rating?.percentage ?? null,
    averageSpendCents: bar.averageSpendCents,
    game: game
      ? {
          id: game.id,
          title:
            names.join(' × ') || game.participantFreeText || game.championship,
          startsAt: game.startsAt,
          live: isLive(game)
        }
      : null
  }
}

/** "Ver no mapa": o ponto da busca (chip `origin`, senão o do campo). */
export function mapFocus(
  chips: FilterChip[],
  fallback: Point | null,
  radiusKm: number
) {
  const search = chipSearch(chips, [], fallback)
  if (!search) return null
  const { lat, lng } = search.input
  return {
    lat,
    lng,
    km: Math.max(1.6, (search.input.radiusKm ?? radiusKm) * 2)
  }
}

// --- Rodapé, fontes e confirmação ---------------------------------------------

/** Até três perguntas; "Ver no mapa" (atalho do app) entra em segundo. */
export function followUps(suggestions: string[], hasBars: boolean) {
  const asks = suggestions
    .slice(0, 3)
    .map((label) => ({ kind: 'ask' as const, label }))
  if (!hasBars) return asks
  return [
    ...asks.slice(0, 1),
    { kind: 'map' as const, label: 'Ver no mapa' },
    ...asks.slice(1)
  ]
}

/** "Usei 3 bares e a agenda de hoje" (o dia vem do chip `date:`). */
export function sourcesLabel(
  sources: Source[],
  chips: FilterChip[],
  now: number
) {
  const day = chips.find((c) => c.key.startsWith('date:'))?.key.slice(5)
  const n = sources.length
  const bars = `${n} ${n === 1 ? 'bar' : 'bares'}`
  if (!day) return `Usei ${bars}`
  const today = ymd(now)
  const tomorrow = ymd(now + DAY)
  const when =
    day === today ? 'de hoje' : day === tomorrow ? 'de amanhã' : 'do dia'
  return `Usei ${bars} e a agenda ${when}`
}

/** A frase depois do "Confirmar" (24e), montada do que deu certo. */
export function confirmText(result: ConfirmResult) {
  const parts: string[] = []
  if (result.going?.ok)
    parts.push(
      result.going.code
        ? 'Pronto! Seu código está aqui embaixo e também em Meus jogos.'
        : 'Pronto! Sua presença está marcada e aparece em Meus jogos.'
    )
  if (result.call?.ok)
    parts.push(
      `${firstName(result.call.friendName)} recebeu seu chamado. Quando tocar em “Vou também”, aparece em quem vai.`
    )
  if (result.remind?.ok)
    parts.push('O lembrete aparece em Avisos no dia do jogo.')
  const failed = [result.going, result.call, result.remind].filter(
    (r): r is { ok: false; reason: string } => r !== null && !r.ok
  )
  for (const f of failed) parts.push(f.reason)
  return parts.join(' ')
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

// --- Quando o chat volta -------------------------------------------------------

const day = (value: Date | number) =>
  new Date(value).toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo'
  })

/** Quando o chat volta: "amanhã à 0h" ou "em 1º de novembro". */
export function resumeLabel(resumesAt: string, now: number) {
  const at = new Date(resumesAt)
  if (day(at) === day(now + 86_400_000)) return 'amanhã à 0h'
  const dayOfMonth = Number(
    at.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: 'numeric'
    })
  )
  const month = at.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: 'long'
  })
  return `em ${dayOfMonth === 1 ? '1º' : dayOfMonth} de ${month}`
}

/** "19:02", no horário de Brasília. */
export const clock = (value: number | string) =>
  new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  })
