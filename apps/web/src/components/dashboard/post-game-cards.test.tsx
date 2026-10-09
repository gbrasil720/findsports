import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  QueryClient,
  QueryClientProvider,
  useQuery
} from '@tanstack/react-query'
import { createTRPCClient, TRPCClientError, type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { AttendanceReportCard } from './attendance-report-card'
import { PendingRatingCard } from './pending-rating-card'

// "Desfazer" nos dois cards pós-jogo do dashboard (WEB-321).

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const game = (eventId: string, barName: string) => ({
  eventId,
  barId: `bar-${eventId}`,
  barName,
  neighborhood: 'Pinheiros',
  championship: 'Brasileirão',
  participants: ['Corinthians', 'Palmeiras'],
  participantFreeText: null,
  startsAt: ONTEM
})
const RATINGS = [game('jogo-a', 'Bar A'), game('jogo-b', 'Bar B')].map(
  (item) => ({ ...item, sport: { name: 'Futebol', slug: 'futebol' } })
)
const REPORTS = [
  { ...game('jogo-c', 'Bar C'), offer: 'Chopp em dobro', answered: false }
]

/**
 * O servidor de mentira guarda só quais jogos já têm resposta: responder
 * tira o jogo das pendências, remover devolve. `failing` derruba um caminho.
 */
const answered = new Set<string>()
const calls: { path: string; input: unknown }[] = []
let failing: string | null = null

const fakeServer: TRPCLink<AppRouter> =
  () =>
  ({ op }) =>
    observable((observer) => {
      const { eventId } = (op.input ?? {}) as { eventId?: string }
      if (op.type === 'mutation') calls.push({ path: op.path, input: op.input })
      if (op.path === failing) {
        observer.error(new TRPCClientError('fora do ar'))
        return
      }
      if (op.path.endsWith('.remove') || op.path.endsWith('.removeReport')) {
        answered.delete(eventId as string)
      } else if (op.type === 'mutation') {
        answered.add(eventId as string)
      }
      const list = op.path.startsWith('ratings.') ? RATINGS : REPORTS
      const data = list.filter((item) => !answered.has(item.eventId))
      observer.next({ result: { type: 'data', data } })
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

type Toast = {
  type: 'success' | 'error'
  message: string
  duration?: number
  action?: { label: string; onClick: () => Promise<unknown> }
}
const toasts: Toast[] = []
const capture =
  (type: Toast['type']) => (message: string, options?: Partial<Toast>) =>
    toasts.push({ ...options, type, message })
mock.module('sonner', () => ({
  toast: { success: capture('success'), error: capture('error') },
  Toaster: () => null
}))

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
  answered.clear()
  calls.length = 0
  toasts.length = 0
  failing = null
})

/** A resposta do servidor de mentira chega numa volta do event loop. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** O dashboard lê as pendências e entrega ao card; aqui também. */
function Ratings() {
  const query = useQuery(trpc.ratings.getPending.queryOptions())
  return <PendingRatingCard pending={query.data ?? []} />
}

async function render(card: 'ratings' | 'reports') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        {card === 'ratings' ? <Ratings /> : <AttendanceReportCard />}
      </QueryClientProvider>
    )
  })
  await settle()
}

const title = () => document.querySelector('h2')?.textContent
const buttons = () =>
  [...document.querySelectorAll('button')].map((button) => button.textContent)

async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label
  )
  if (!button) throw new Error(`botão "${label}" não está na tela`)
  await act(async () => button.click())
  await settle()
}

async function undo(toast: Toast | undefined) {
  expect(toast?.action?.label).toBe('Desfazer')
  await act(async () => {
    await toast?.action?.onClick()
  })
  await settle()
}

test('desfazer devolve o jogo daquele aviso, não o que está na tela', async () => {
  await render('ratings')

  // A resposta leva à pergunta seguinte, sem pular nenhuma.
  expect(title()).toBe('Voltaria pra ver jogo no Bar A?')
  await click('Não voltaria')
  expect(title()).toBe('Voltaria pra ver jogo no Bar B?')
  await click('Voltaria')
  expect(title()).toBeUndefined()

  // Dois avisos, cada um com o seu jogo; o comum fica 4 s.
  expect(toasts.map(({ type }) => type)).toEqual(['success', 'success'])
  expect(toasts[0]?.duration).toBeGreaterThan(4000)

  await undo(toasts[0])
  expect(calls.at(-1)).toEqual({
    path: 'ratings.remove',
    input: { barId: 'bar-jogo-a', eventId: 'jogo-a' }
  })
  expect(title()).toBe('Voltaria pra ver jogo no Bar A?')
  expect(buttons()).toEqual(['Voltaria', 'Não voltaria', 'Pular'])
  expect(toasts.at(-1)?.message).toBe('Resposta desfeita.')
})

test('a pergunta desfeita volta na frente das que ainda estão abertas', async () => {
  await render('ratings')
  await click('Voltaria')
  await click('Voltaria')

  await undo(toasts[0])
  expect(title()).toBe('Voltaria pra ver jogo no Bar A?')
  // "Bar A" segue aberto e vem antes na lista; quem aparece é o desfeito.
  await undo(toasts[1])
  expect(title()).toBe('Voltaria pra ver jogo no Bar B?')
})

test('se desfazer falha, o aviso diz e a resposta continua valendo', async () => {
  await render('reports')
  await click('Fui e recebi')
  expect(title()).toBeUndefined()

  failing = 'attendance.removeReport'
  await undo(toasts[0])
  expect(calls.at(-1)).toEqual({
    path: 'attendance.removeReport',
    input: { eventId: 'jogo-c' }
  })
  expect(toasts.at(-1)).toMatchObject({
    type: 'error',
    message: 'Não foi possível desfazer. Sua resposta continua valendo.'
  })
  expect(title()).toBeUndefined()
})

test('"Depois do jogo" desfeito volta com as mesmas opções', async () => {
  await render('reports')
  const options = buttons()
  expect(options).toEqual([
    'Fui e recebi',
    'Fui, sem a oferta',
    'Não fui',
    'Pular'
  ])
  await click('Não fui')
  expect(title()).toBeUndefined()

  await undo(toasts[0])
  expect(title()).toBe('Você foi ao Bar C?')
  expect(buttons()).toEqual(options)
})

test.each([
  ['reports', 'attendance.report', 'Fui e recebi'],
  ['ratings', 'ratings.submit', 'Voltaria']
] as const)('%s: resposta que não grava deixa o card na tela, com o erro', async (card, path, label) => {
  failing = path
  await render(card)
  const question = title()
  await click(label)

  expect(title()).toBe(question)
  // Sem resposta gravada não há o que desfazer.
  expect(toasts.filter(({ action }) => action)).toEqual([])
  const error =
    document.querySelector('[role="alert"]')?.textContent ??
    toasts.find(({ type }) => type === 'error')?.message
  expect(error).toContain('Não foi possível registrar')
})
