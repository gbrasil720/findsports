import { describe, expect, it } from 'bun:test'
import { buildEventComparison, toEventComparisonRow } from './comparison'
import {
  applyEventComparisonEntitlements,
  getAnalyticsEntitlements,
  getComparisonMetrics
} from './entitlements'
import type { EventAnalyticsSnapshot } from './types'

const snapshot = (
  eventId: string,
  values: Partial<EventAnalyticsSnapshot> = {}
): EventAnalyticsSnapshot => ({
  eventId,
  eventName: `Jogo ${eventId}`,
  startsAt: `2026-09-${eventId}T20:00:00.000Z`,
  weekday: 1,
  windowHours: 2,
  uniqueVisitors: 10,
  profileViews: 20,
  directionsOpened: 0,
  phoneClicked: 4,
  whatsappOpened: 0,
  ...values
})

describe('event comparison', () => {
  it('normaliza cada métrica pela janela efetiva do jogo', () => {
    const row = toEventComparisonRow(
      snapshot('1', {
        uniqueVisitors: 10,
        profileViews: 20,
        phoneClicked: 3,
        directionsOpened: 2
      })
    )

    expect(row.normalized).toEqual({
      uniqueVisitors: 5,
      profileViews: 10,
      directionsOpened: 1,
      phoneClicked: 1.5,
      whatsappOpened: 0
    })
    expect(row.conversionRate).toBe(50)
  })

  it('compara jogos selecionados e ordena pelo percentual de conversão', () => {
    const result = buildEventComparison({
      mode: 'cross_game',
      target: { type: 'events', eventIds: ['2', '1'] },
      currentRows: [
        snapshot('1', { uniqueVisitors: 10, phoneClicked: 5 }),
        snapshot('2', { uniqueVisitors: 20, phoneClicked: 2 }),
        snapshot('3', { uniqueVisitors: 100, phoneClicked: 100 })
      ]
    })

    expect(result.status).toBe('ready')
    expect(result.events.map((event) => event.eventId)).toEqual(['2', '1'])
    expect(result.ranking).toEqual([
      { eventId: '1', eventName: 'Jogo 1', conversionRate: 50, rank: 1 },
      { eventId: '2', eventName: 'Jogo 2', conversionRate: 10, rank: 2 }
    ])
    expect(result.events).toHaveLength(2)
  })

  it('compara um jogo com a média dos demais jogos do mesmo bar', () => {
    const result = buildEventComparison({
      mode: 'cross_game',
      target: { type: 'event_to_bar', eventId: '1' },
      currentRows: [
        snapshot('1', { uniqueVisitors: 10, profileViews: 20 }),
        snapshot('2', { uniqueVisitors: 20, profileViews: 40 }),
        snapshot('3', { uniqueVisitors: 40, profileViews: 80 })
      ]
    })

    expect(result.status).toBe('ready')
    expect(result.events.map((event) => event.eventId)).toEqual(['1'])
    expect(result.benchmark).toMatchObject({
      eventId: 'bar-average',
      uniqueVisitors: 30,
      profileViews: 60
    })
  })

  it('calcula tendência histórica, sazonalidade e anomalia rastreável', () => {
    const result = buildEventComparison({
      mode: 'advanced',
      target: { type: 'events', eventIds: ['1', '2'] },
      currentRows: [
        snapshot('1', { weekday: 1, phoneClicked: 5 }),
        snapshot('2', { weekday: 2, phoneClicked: 0 }),
        snapshot('3', { weekday: 3, phoneClicked: 100 })
      ],
      historicalRows: [
        snapshot('old-1', { weekday: 1, phoneClicked: 1 }),
        snapshot('old-2', { weekday: 1, phoneClicked: 1 }),
        snapshot('old-3', { weekday: 2, phoneClicked: 2 })
      ]
    })

    expect(result.benchmarks).toContainEqual({
      scope: 'history',
      metric: 'phoneClicked',
      current: 1.25,
      baseline: 0.67,
      changePercent: 87.5
    })
    expect(result.benchmarks).toContainEqual({
      scope: 'weekday',
      metric: 'phoneClicked',
      eventId: '1',
      weekday: 1,
      current: 2.5,
      baseline: 0.5,
      changePercent: 400
    })
    expect(result.insights).toContainEqual({
      kind: 'anomaly',
      scope: 'weekday',
      metric: 'phoneClicked',
      eventId: '1',
      eventName: 'Jogo 1',
      weekday: 1,
      value: 2.5,
      baseline: 0.5,
      changePercent: 400
    })
  })

  it('retorna estado vazio sem dois jogos com dados', () => {
    const result = buildEventComparison({
      mode: 'cross_game',
      target: { type: 'events', eventIds: ['1'] },
      currentRows: [snapshot('1')]
    })

    expect(result.status).toBe('empty')
    expect(result.emptyReason).toBe('not_enough_games')
    expect(result.events).toEqual([])
  })
})

describe('comparison entitlements', () => {
  it('exposes only eligible comparison metrics for each plan', () => {
    expect(getComparisonMetrics(getAnalyticsEntitlements('starter'))).toEqual([
      'uniqueVisitors',
      'profileViews'
    ])
    expect(getComparisonMetrics(getAnalyticsEntitlements('pro'))).toEqual([
      'uniqueVisitors',
      'profileViews',
      'directionsOpened',
      'phoneClicked',
      'whatsappOpened'
    ])
    expect(getComparisonMetrics(getAnalyticsEntitlements('elite'))).toEqual([
      'uniqueVisitors',
      'profileViews',
      'directionsOpened',
      'phoneClicked',
      'whatsappOpened'
    ])
  })

  it('removes blocked metrics before ranking and insight output', () => {
    const comparison = buildEventComparison({
      mode: 'advanced',
      target: { type: 'events', eventIds: ['1', '2'] },
      currentRows: [
        snapshot('1', { directionsOpened: 10, phoneClicked: 0 }),
        snapshot('2', { directionsOpened: 0, phoneClicked: 1 })
      ],
      historicalRows: [snapshot('old', { directionsOpened: 1 })]
    })

    const starter = applyEventComparisonEntitlements(
      comparison,
      getAnalyticsEntitlements('starter')
    )
    expect(starter.events[0]?.directionsOpened).toBeNull()
    expect(starter.events[0]?.phoneClicked).toBeNull()
    expect(starter.events[0]?.normalized.directionsOpened).toBeNull()
    expect(
      starter.benchmarks.every((item) => item.metric !== 'directionsOpened')
    ).toBe(true)
    expect(
      starter.insights.every((item) => item.metric !== 'directionsOpened')
    ).toBe(true)
  })
})
