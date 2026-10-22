import type { SearchBar } from '@/components/explore'

/*
 * A fronteira do chat da IA (Rodada 24), copiada do contrato
 * (`design-ref/specs/r24-contrato.md`) enquanto `ai.converse` e `ai.confirm`
 * não chegam a este branch.
 *
 * TROCAR: quando `packages/api/src/lib/ai/events.ts` existir, apague este
 * arquivo e importe dali (`import type { ChatEvent, … } from
 * '@findsports_oficial/api/lib/ai/events'`).
 *
 * Dois pontos que o contrato deixa em aberto e que este arquivo assume
 * (perguntados ao coordenador):
 * - `bars` traz o `SearchBar` de `pubs.search`, como `ai.chat` devolve hoje: é
 *   o que o card do Explorar (`BarRow`) consome.
 * - `done` traz `search`, os argumentos da busca que a IA fez (como o `search`
 *   de `ai.chat`): tirar um chip refaz a busca sem ele, sem IA. A `key` do chip
 *   é o argumento de `pubs.search`, com o valor depois de `:` quando o
 *   argumento é lista (`amenities:3`, `teamIds:<id>`).
 */

export type ChatBar = SearchBar

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

/** Os argumentos de `pubs.search` que a IA usou (sem `cursor` e `sort`). */
export type ChatSearch = {
  lat: number
  lng: number
  radiusKm?: number
  sportId?: string
  championship?: string
  date?: string
  amenities?: number[]
  teamIds?: string[]
  limit?: number
  neighborhood: string | null
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
      state: 'run' | 'done'
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
      search?: ChatSearch | null
    }

export type ConverseInput = {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  origin: { lat: number; lng: number } | null
  placeLabel: string | null
  radiusKm?: number
  day: 'today' | 'tomorrow' | null
  useTastes: boolean
  redo?: boolean
}

export type ConfirmInput = {
  runId: string
  proposalId: string
  actions: { going: boolean; call: boolean; remind: boolean }
}

type Outcome<T> = (T & { ok: true }) | { ok: false; reason: string } | null

export type ConfirmResult = {
  going: Outcome<{
    code: string | null
    eventTitle: string
    startsAt: string
    barName: string
    neighborhood: string | null
  }>
  call: Outcome<{ friendName: string }>
  remind: Outcome<object>
  at: string
}
