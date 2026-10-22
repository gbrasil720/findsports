/*
 * A fronteira do chat da IA (Rodada 24): os tipos de
 * `packages/api/src/lib/ai/events.ts` do servidor (w6), copiados enquanto
 * aquele arquivo não chega a este branch. Contrato:
 * `design-ref/specs/r24-contrato.md`.
 *
 * TROCAR: quando `packages/api/src/lib/ai/events.ts` existir aqui, apague os
 * tipos copiados e importe dali (`import type { ChatEvent, … } from
 * '@findsports_oficial/api/lib/ai/events'`). `ConverseInput`,
 * `ConfirmInput` e `ConfirmResult` saem do `AppRouter` (entrada e saída de
 * `ai.converse` e `ai.confirm`).
 *
 * A `key` de cada chip é `<argumento de pubs.search>:<valor>` (`teamIds:<id>`,
 * `amenities:1`, `date:2026-10-22`, `radiusKm:3`, `championship:<nome>`),
 * mais `neighborhood:<bairro>` (filtro da lista) e `origin:<lat>,<lng>`.
 */

export type ChatBar = {
  id: string
  name: string
  neighborhood: string | null
  distanceKm: number | null
  photoUrl: string | null
  plan: string | null
  ratingPercent: number | null
  game: { id: string; title: string; startsAt: string; live: boolean } | null
  averageSpendCents: number | null
}

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
