import { describe, expect, test } from 'bun:test'

import { type LinhaBusca, montarPaginaBusca } from './pub-search/shared'
import { utcIso } from './utc-timestamp'

/**
 * WEB-250: o card da busca mostrava o jogo das 16:55 às 19:55. O SQL cru
 * devolvia `timestamp` sem fuso e o navegador lia a string como horário
 * local.
 */
const COM_FUSO = /(?:Z|[+-]\d{2}:?\d{2})$/

describe('utcIso', () => {
  test('timestamp sem fuso é lido como UTC, em qualquer fuso do processo', () => {
    expect(utcIso('2026-10-08 19:55:00')).toBe('2026-10-08T19:55:00.000Z')
    expect(utcIso('2026-10-08 19:55:00.123456')).toBe(
      '2026-10-08T19:55:00.123Z'
    )
  })

  test('timestamptz e Date passam sem ganhar um segundo deslocamento', () => {
    expect(utcIso('2026-10-08 16:55:00-03')).toBe('2026-10-08T19:55:00.000Z')
    expect(utcIso('2026-10-08T19:55:00.000Z')).toBe('2026-10-08T19:55:00.000Z')
    expect(utcIso(new Date('2026-10-08T19:55:00.000Z'))).toBe(
      '2026-10-08T19:55:00.000Z'
    )
  })
})

describe('montarPaginaBusca', () => {
  const linha: LinhaBusca = {
    id: 'bar-1',
    name: 'Bar do Zé',
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    latitude: '-23.56',
    longitude: '-46.69',
    photo_url: null,
    created_at: '2026-09-01 12:00:00',
    plan: 'starter',
    event_count: 1,
    distance_km: 0.4,
    cursor_plan_rank: 2,
    cursor_next_event_at: '2026-10-08 19:55:00.000000',
    next_event_id: 'evento-1',
    next_championship: 'Brasileirão',
    // Exatamente o que o `db.execute` entrega para `event.starts_at`.
    next_event_starts_at: '2026-10-08 19:55:00',
    next_event_ends_at: null,
    next_sport_name: 'Futebol',
    next_sport_slug: 'futebol',
    next_participant_free_text: null,
    next_classic_rule_version: null,
    next_classic_rule_reason: null,
    next_participants: []
  }

  test('startsAt do próximo jogo sai com fuso, no instante que o banco guarda', () => {
    const startsAt = montarPaginaBusca([linha], 30).bars[0]?.nextEvent?.startsAt

    expect(startsAt).toMatch(COM_FUSO)
    expect(startsAt).toBe('2026-10-08T19:55:00.000Z')
  })
})
