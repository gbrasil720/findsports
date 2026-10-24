import { afterEach, expect, mock, setSystemTime, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { MapBar } from '@/components/app/onside-map'
import type { SearchBar } from '@/domain/dashboard-selectors'

mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => (
    <a href="/bar">{children}</a>
  )
}))

// O MapLibre não roda no jsdom: o dublê mostra o pino de cada bar.
mock.module('@/components/app/onside-map', () => ({
  OnsideMap: ({ bars }: { bars: MapBar[] }) => (
    <div data-testid="mapa">
      {bars.map((bar) => (
        <span key={bar.id} data-pin={bar.pin} />
      ))}
    </div>
  )
}))

const { MinuteTickProvider } = await import('@/components/app/minute-tick')
const { DashboardResults } = await import('./dashboard-results')

const APITO = new Date('2026-10-24T20:00:00.000Z')

const bar = {
  id: 'bar-1',
  name: 'Bar do Teste',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  latitude: '-23.56',
  longitude: '-46.68',
  photo_url: null,
  created_at: '2026-01-01T00:00:00.000Z',
  averageSpendCents: null,
  amenities: [],
  goingCount: null,
  goingInitials: [],
  rating: null,
  distance_km: 1,
  plan: 'starter',
  event_count: 1,
  nextEvent: {
    id: 'evento-1',
    championship: 'Brasileirão',
    startsAt: APITO.toISOString(),
    endsAt: null,
    sport: { name: 'Futebol', slug: 'futebol' },
    participants: [],
    onBigScreen: false,
    withSound: false,
    participantFreeText: null,
    classic: null
  }
} as unknown as SearchBar

let dom: JSDOM | undefined
let root: Root | undefined
const realSetTimeout = globalThis.setTimeout

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = undefined
  dom?.window.close()
  globalThis.setTimeout = realSetTimeout
  setSystemTime()
})

test('o pino do mapa vira "ao vivo" no apito, junto com o card', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true
  })
  for (const key of ['window', 'document', 'navigator'] as const) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true
    })
  }
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  // O relógio de minuto agenda a virada com setTimeout; o teste a dispara.
  const viradas: (() => void)[] = []
  globalThis.setTimeout = ((fn: () => void) => {
    viradas.push(fn)
    return 0
  }) as unknown as typeof setTimeout

  setSystemTime(new Date(APITO.getTime() - 30_000))
  const container = dom.window.document.body
  root = createRoot(container)
  act(() =>
    root?.render(
      <MinuteTickProvider>
        <DashboardResults
          resultState={{ status: 'ready', bars: [bar], fallback: false }}
          bars={[bar]}
          radiusKm={5}
          hasActiveFilters={false}
          locationState="granted"
          coords={{ lat: -23.56, lng: -46.68 }}
          profileCity={null}
          favoriteIds={new Set()}
          favoritePending={false}
          classicPlacementGuaranteed={false}
          onFavorite={() => {}}
          onRequestLocation={() => {}}
          onRadiusChange={() => {}}
          onReset={() => {}}
          onRetry={() => {}}
          retryable={false}
          onSuggestion={() => {}}
          onSelectMapBar={() => {}}
        />
      </MinuteTickProvider>
    )
  )
  const pino = () =>
    container.querySelector('[data-pin]')?.getAttribute('data-pin')
  const cardAoVivo = () => container.textContent?.includes('Ao vivo')

  expect(pino()).toBe('starter')
  expect(cardAoVivo()).toBe(false)

  setSystemTime(APITO)
  act(() => {
    for (const virada of viradas.splice(0)) virada()
  })

  expect(pino()).toBe('live')
  expect(cardAoVivo()).toBe(true)
})
