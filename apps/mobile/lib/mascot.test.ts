import { describe, expect, it } from 'bun:test'

import { type Reply, startReply } from './ai-chat'
import type { ChatBar, ConfirmResult } from './ai-events'
import { mascotState } from './mascot'

const on = { online: true, off: false, blocked: false }
const bar = { id: 'a' } as ChatBar
const step = (id: string, state: 'todo' | 'run' | 'done') => ({
  id,
  label: id,
  state
})
const reply = (patch: Partial<Reply>): Reply => ({ ...startReply(0), ...patch })
const failed = { ok: false as const, code: 'refused' as const, reason: 'x' }

describe('mascotState', () => {
  it('sem conversa: parada, a não ser que o chat esteja fora ou no limite', () => {
    expect(mascotState(null, on)).toBe('idle')
    expect(mascotState(null, { ...on, off: true })).toBe('down')
    expect(mascotState(null, { ...on, blocked: true })).toBe('limit')
    expect(mascotState(null, { ...on, online: false })).toBe('offline')
  })

  it('cada passo do chat tem a sua cena; o "todo" ainda não conta', () => {
    expect(mascotState(reply({}), on)).toBe('thinking')
    expect(
      mascotState(
        reply({
          steps: [
            step('understood', 'done'),
            step('game', 'run'),
            step('rank', 'todo')
          ]
        }),
        on
      )
    ).toBe('live')
    expect(
      mascotState(
        reply({ steps: [step('game', 'done'), step('search', 'run')] }),
        on
      )
    ).toBe('searching')
    expect(
      mascotState(
        reply({ steps: [step('search', 'done'), step('rank', 'run')] }),
        on
      )
    ).toBe('comparing')
    expect(
      mascotState(reply({ steps: [step('rank', 'run')], text: 'O ' }), on)
    ).toBe('writing')
  })

  it('fim: comemora com bares, murcha sem', () => {
    expect(mascotState(reply({ state: 'done', bars: [bar] }), on)).toBe('done')
    expect(mascotState(reply({ state: 'done' }), on)).toBe('empty')
    // Festa só na primeira resposta da conversa.
    expect(
      mascotState(reply({ state: 'done', bars: [bar] }), {
        ...on,
        first: false
      })
    ).toBe('pleased')
    expect(mascotState(reply({ state: 'stopped', text: 'O' }), on)).toBe(
      'stopped'
    )
    expect(mascotState(reply({ state: 'limit' }), on)).toBe('limit')
    expect(mascotState(reply({ state: 'unavailable' }), on)).toBe('down')
  })

  it('proposta espera; a confirmação vira a cena da ação feita', () => {
    const proposal = {} as Reply['proposal']
    expect(mascotState(reply({ proposal }), on)).toBe('awaiting')
    expect(
      mascotState(reply({ proposal, decision: { kind: 'sending' } }), on)
    ).toBe('thinking')
    expect(
      mascotState(
        reply({ proposal, decision: { kind: 'refused', at: '' } }),
        on
      )
    ).toBe('idle')
    const approved = (result: Partial<ConfirmResult>) =>
      mascotState(
        reply({
          proposal,
          decision: {
            kind: 'approved',
            result: {
              going: null,
              call: null,
              remind: null,
              at: '',
              ...result
            } as ConfirmResult
          }
        }),
        on
      )
    expect(approved({ going: { ok: true } as ConfirmResult['going'] })).toBe(
      'going'
    )
    expect(approved({ call: { ok: true, friendName: 'M' } })).toBe('call')
    expect(approved({ remind: { ok: true } as ConfirmResult['remind'] })).toBe(
      'remind'
    )
    expect(approved({ going: failed })).toBe('refused')
  })

  it('sem rede vence tudo', () => {
    expect(mascotState(reply({ text: 'O' }), { ...on, online: false })).toBe(
      'offline'
    )
  })
})
