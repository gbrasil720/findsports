import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ReservationsTab } from './reservations-tab'

const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const GAME = {
  championship: 'Brasileirão',
  participantFreeText: null,
  participants: ['Corinthians', 'Palmeiras']
}

/** O servidor de mentira: cada procedure devolve uma resposta fixa. */
const RESPONSES: Record<string, unknown> = {
  'barReservations.list': [
    {
      id: '7d0b3f0e-6c55-4c0e-9d63-3b0c0a7a1c11',
      status: 'pending',
      partySize: 2,
      note: null,
      offerSnapshot: 'Chopp em dobro',
      createdAt: AMANHA,
      guestName: 'Marina Souza',
      event: { ...GAME, startsAt: AMANHA }
    }
  ],
  'barReservations.capacity': {
    defaultCap: 10,
    games: [
      {
        ...GAME,
        id: 'jogo-1',
        startsAt: AMANHA,
        reservationCap: null,
        effectiveCap: 10,
        confirmedSeats: 8,
        soldOut: false
      }
    ]
  },
  'barReservations.respond': { status: 'confirmed', changed: true },
  'barReservations.setDefaultCap': { reservationCap: 10 },
  'barReservations.setGameCap': { reservationCap: 10 }
}

const fakeServer: TRPCLink<AppRouter> =
  () =>
  ({ op }) =>
    observable((observer) => {
      observer.next({ result: { type: 'data', data: RESPONSES[op.path] } })
      observer.complete()
    })

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})
const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({ links: [fakeServer] }),
  queryClient
})

mock.module('@/utils/trpc', () => ({ useTRPC: () => trpc }))

let dom: JSDOM
let root: Root | undefined

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  for (const key of ['window', 'document', 'navigator'] as const) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true
    })
  }
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = undefined
  queryClient.clear()
  dom.window.close()
})

/** A resposta do servidor de mentira chega numa volta do event loop. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ReservationsTab active />
      </QueryClientProvider>
    )
  })
  await settle()
}

const observerOf = (queryKey: readonly unknown[]) =>
  queryClient.getQueryCache().find({ queryKey })?.observers[0]

test('the cap panel polls on the same interval as the queue', async () => {
  await render()

  const queue = observerOf(trpc.barReservations.list.queryKey())
  const capacity = observerOf(trpc.barReservations.capacity.queryKey())
  expect(queue?.options.refetchInterval).toBeGreaterThan(0)
  expect(capacity?.options.refetchInterval).toBe(queue?.options.refetchInterval)
})

test('each request shows the offer frozen in the reservation (WEB-297)', async () => {
  await render()

  expect(document.querySelector('article')?.textContent).toContain(
    'Oferta da casa nesta reserva: Chopp em dobro'
  )
})

test("answering a request invalidates the bar's public profile", async () => {
  // A prévia em "Meu espaço" e o perfil público leem o esgotado daqui.
  const profileKey = trpc.pubs.getById.queryKey({ id: 'bar-1' })
  queryClient.setQueryData(profileKey, {} as never)
  await render()

  const confirm = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Confirmar reserva'
  )
  if (!confirm) throw new Error('botão "Confirmar reserva" não está na tela')
  await act(async () => confirm.click())
  await settle()

  expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
})

// O teto também decide o esgotado: [0] é o padrão do bar, [1] o do jogo.
test.each([
  ['default', 0],
  ['per-game', 1]
])("saving the %s cap invalidates the bar's public profile", async (_, index) => {
  const profileKey = trpc.pubs.getById.queryKey({ id: 'bar-1' })
  queryClient.setQueryData(profileKey, {} as never)
  await render()

  const save = [...document.querySelectorAll('button')].filter(
    (button) => button.textContent === 'Salvar'
  )[index]
  if (!save) throw new Error('botão "Salvar" não está na tela')
  await act(async () => save.click())
  await settle()

  expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
})
