/**
 * Os eventos de `ai.converse` (Rodada 24): o app importa estes tipos com
 * `import type`. A fronteira está em `r24-contrato.md`; mudar um tipo daqui é
 * mudar o contrato com o app.
 */

export type ChatBar = {
  id: string
  name: string
  neighborhood: string | null
  /** Para o "Ver no mapa" enquadrar os bares da resposta (WEB-432). */
  latitude: number
  longitude: number
  distanceKm: number | null
  photoUrl: string | null
  plan: string | null
  ratingPercent: number | null
  game: { id: string; title: string; startsAt: string; live: boolean } | null
  averageSpendCents: number | null
}

/**
 * O que a IA entendeu (24c). `key` é `<argumento de pubs.search>:<valor>`
 * (`teamIds:<id>`, `amenities:1`, `date:2026-10-22`, `radiusKm:3`,
 * `championship:Brasileirão`): o app refaz a busca sem o chip tirado, sem IA.
 * `neighborhood:<bairro>` não é argumento do `pubs.search`: é o filtro que a
 * tela aplica na lista que volta.
 */
export type FilterChip = {
  key: string
  label: string
  icon: 'tv' | 'cal' | 'sun' | 'pin' | 'sport' | 'team' | 'beer'
}

export type Source = {
  barId: string
  name: string
  photoUrl: string | null
  why: string
}

export type ProposalAction =
  | { kind: 'going'; label: string; on: boolean }
  | { kind: 'call'; friendId: string; label: string; on: boolean }
  | { kind: 'remind'; label: string; on: boolean }

export type Proposal = {
  id: string
  bar: { id: string; name: string; photoUrl: string | null }
  game: { id: string; title: string; startsAt: string }
  actions: ProposalAction[]
}

/**
 * Ação do `ai.confirm` que não foi feita. `code` é estável, para o app
 * decidir; `reason` é a frase para a tela, nunca mensagem interna.
 * - `not_friends`, `duplicate`, `past_game`: recusas do chamado de amigo.
 * - `refused`: recusa do servidor (jogo encerrado, bar fora do ar...), com a
 *   frase dele.
 * - `failed`: erro inesperado, com texto fixo.
 */
export type ConfirmFailure = {
  ok: false
  code: 'not_friends' | 'duplicate' | 'past_game' | 'refused' | 'failed'
  reason: string
}

export type ChatEvent =
  | {
      type: 'blocked'
      reason: 'limit'
      scope: 'day' | 'month'
      resumesAt: string
    }
  | { type: 'blocked'; reason: 'unavailable' }
  | {
      type: 'step'
      id: string
      label: string
      // 'todo': passo que ainda vem ("Comparar e ordenar" vazio, 24b).
      state: 'todo' | 'run' | 'done'
      tags?: string[]
      detail?: string
    }
  | {
      type: 'tool'
      id: string
      name: string
      label: string
      state: 'run' | 'done' | 'wait'
      params?: [string, string][]
      output?: string
    }
  | { type: 'bars'; bars: ChatBar[] }
  | { type: 'text'; text: string }
  | { type: 'proposal'; proposal: Proposal }
  | {
      type: 'done'
      runId: string
      status: string
      thoughtMs: number
      searches: number
      chips: FilterChip[]
      sources: Source[]
      suggestions: string[]
      remainingToday: number
    }

export type Emit = (event: ChatEvent) => void

/**
 * Fila entre o trabalho (que empurra eventos) e o gerador do tRPC (que os
 * entrega um a um, conforme chegam).
 */
export function eventQueue<T>() {
  const items: T[] = []
  let wake: (() => void) | null = null
  let closed = false
  return {
    push(item: T) {
      items.push(item)
      wake?.()
    },
    close() {
      closed = true
      wake?.()
    },
    async *drain() {
      while (true) {
        while (items.length) yield items.shift() as T
        if (closed) return
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        wake = null
      }
    }
  }
}

/**
 * Citação `[[n]]` aponta para a posição do bar em `bares` do `responder`.
 * Depois da conferência (bar inventado sai), a lista final é outra: cada
 * citação é renumerada para a posição em `bars`, e a que não aponta para um
 * bar dela sai do texto.
 */
export function renumberCitations(
  text: string,
  cited: string[] | null,
  bars: { id: string }[]
) {
  return text
    .replace(/\s*\[\[(\d+)\]\]/g, (match, raw: string) => {
      const n = Number(raw)
      if (cited === null) return n >= 1 && n <= bars.length ? match : ''
      const id = cited[n - 1]
      const at = id ? bars.findIndex((b) => b.id === id) : -1
      return at < 0 ? '' : match.replace(raw, String(at + 1))
    })
    .trim()
}

const MAX_SUGGESTIONS = 3
const MAX_SUGGESTION_CHARS = 40

/** Até três perguntas curtas, sem repetir e sem "Ver no mapa" (é do app). */
export function cleanSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const text = item.replace(/[«»[\]]/g, '').trim()
    const key = text.toLocaleLowerCase('pt-BR')
    if (!text || text.length > MAX_SUGGESTION_CHARS) continue
    if (key.includes('ver no mapa') || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length === MAX_SUGGESTIONS) break
  }
  return out
}
