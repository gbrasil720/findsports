import type { SearchBar } from '@/components/explore'
import { clock } from './ai-chat'
import type {
  ChatEvent,
  ConfirmInput,
  ConfirmResult,
  ConverseInput
} from './ai-events'
import { env } from './env'

/*
 * Dublê do `ai.converse` e do `ai.confirm` (Rodada 24), só em
 * desenvolvimento: a sequência de eventos do contrato com o tempo de uma
 * resposta de verdade, sem modelo e sem crédito. Liga por `?dubla=1` na
 * busca com IA (o navegador DEV abre cada estado assim).
 *
 * Pergunta com "marca" ou "chama" vira a proposta (24d); o resto, a busca
 * com três bares (24c). `?dubla=limite` e `?dubla=fora` respondem o limite e
 * a IA fora do ar. `hold` para no meio da ferramenta (24b) até a pessoa parar.
 */

export type Dubla = '1' | 'limite' | 'fora'

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    })
  })

const HOUR = 3_600_000
const photo = `${env.EXPO_PUBLIC_SERVER_URL}/hero-bar.jpg`

/** Hoje às 21:30 em Brasília (UTC−3), para o jogo do exemplo. */
function tonight(now: number) {
  const day = new Date(now - 3 * HOUR).toISOString().slice(0, 10)
  return new Date(`${day}T21:30:00-03:00`).toISOString()
}

const game = (
  id: string,
  home: string,
  away: string,
  startsAt: string,
  championship = 'Brasileirão'
) => ({
  id,
  championship,
  startsAt,
  endsAt: null,
  sport: { name: 'Futebol', slug: 'futebol' },
  participants: [
    { team: { name: home, logoUrl: null } },
    { team: { name: away, logoUrl: null } }
  ],
  participantFreeText: null,
  classic: null
})

function bar(
  i: number,
  name: string,
  neighborhood: string,
  km: number,
  plan: string,
  rating: number,
  nextEvent: ReturnType<typeof game>
) {
  return {
    id: `00000000-0000-4000-8000-0000000000a${i}`,
    name,
    neighborhood,
    city: 'São Paulo',
    latitude: String(-23.556 + i * 0.004),
    longitude: String(-46.69 + i * 0.003),
    photo_url: photo,
    created_at: new Date(Date.now() - 400 * 24 * HOUR).toISOString(),
    distance_km: km,
    plan,
    event_count: 1,
    rating: { positive: rating, total: 100, percentage: rating },
    averageSpendCents: 6000,
    amenities: [1, 4],
    goingCount: null,
    goingInitials: [],
    nextEvent
  } as unknown as SearchBar
}

/** Os três bares da 24c. */
export function dublaBars(now: number): SearchBar[] {
  const day = new Date(now - 3 * HOUR).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.parse(`${day}T16:00:00-03:00`) + 24 * HOUR)
  return [
    bar(
      1,
      'Bar do Zé',
      'Vila Madalena',
      0.8,
      'elite',
      87,
      game(
        'ev-dubla-1',
        'Corinthians',
        'Palmeiras',
        new Date(now - 20 * 60_000).toISOString()
      )
    ),
    bar(
      2,
      'Casa 92',
      'Pinheiros',
      1.4,
      'pro',
      92,
      game('ev-dubla-2', 'Grêmio', 'Internacional', tonight(now))
    ),
    bar(
      3,
      'Empório Matilde',
      'Vila Madalena',
      2.3,
      'pro',
      78,
      game(
        'ev-dubla-3',
        'Flamengo',
        'Fluminense',
        tomorrow.toISOString(),
        'Carioca'
      )
    )
  ]
}

const ANSWER =
  'Achei 3 bares passando **Corinthians × Palmeiras** hoje às 21:30, com telão e área externa. O **Bar do Zé** [[1]] é o mais perto, a 800 m, e tem chopp em dobro até o intervalo. O **Casa 92** [[2]] tem a melhor nota, e o **Empório Matilde** [[3]] costuma encher menos.'

/** O texto chega em pedaços de poucas palavras, como do modelo. */
function chunks(text: string, size = 4) {
  const words = text.match(/\S+\s*/g) ?? [text]
  return Array.from({ length: Math.ceil(words.length / size) }, (_, i) =>
    words.slice(i * size, (i + 1) * size).join('')
  )
}

type Options = { mode: Dubla; hold?: boolean }

export async function* dublaConverse(
  input: ConverseInput,
  signal: AbortSignal,
  { mode, hold }: Options
): AsyncGenerator<ChatEvent> {
  const now = Date.now()
  await wait(350, signal)
  if (mode === 'limite') {
    yield {
      type: 'blocked',
      reason: 'limit',
      scope: 'day',
      resumesAt: new Date(
        Date.parse(new Date(now - 3 * HOUR).toISOString().slice(0, 10)) +
          27 * HOUR
      ).toISOString()
    }
    return
  }
  if (mode === 'fora') {
    yield { type: 'blocked', reason: 'unavailable' }
    return
  }

  if (/\b(marca|chama)/i.test(input.message)) {
    yield* proposal(signal, now)
    return
  }

  const place = input.placeLabel ?? 'Pinheiros'
  yield { type: 'step', id: 's1', label: 'Entendi o pedido', state: 'run' }
  await wait(700, signal)
  yield {
    type: 'step',
    id: 's1',
    label: 'Entendi o pedido',
    state: 'done',
    tags: ['Corinthians', 'Hoje', 'Telão', 'Área externa', place]
  }
  yield { type: 'step', id: 's2', label: 'Achei o jogo', state: 'run' }
  await wait(600, signal)
  yield {
    type: 'step',
    id: 's2',
    label: 'Achei o jogo',
    state: 'done',
    detail: 'Corinthians × Palmeiras · 21:30 · Brasileirão'
  }
  yield {
    type: 'step',
    id: 's3',
    label: 'Procurando bares que vão passar',
    state: 'run'
  }
  const tool = {
    type: 'tool' as const,
    id: 't1',
    name: 'buscar_bares',
    label: 'Bares com o jogo',
    params: [
      ['jogo', 'COR × PAL · 21:30'],
      ['raio', `${input.radiusKm ?? 3} km de ${place}`],
      ['tem', 'telão, área externa']
    ] as [string, string][]
  }
  await wait(250, signal)
  yield { ...tool, state: 'run' }
  await wait(900, signal)
  yield { ...tool, state: 'run', output: '14 bares encontrados, filtrando…' }
  if (hold) await wait(10 * 60_000, signal)
  await wait(1400, signal)
  const bars = dublaBars(now)
  yield { ...tool, state: 'done', output: '3 bares · 0,8 a 2,3 km' }
  yield { type: 'bars', bars }
  yield {
    type: 'step',
    id: 's3',
    label: 'Procurando bares que vão passar',
    state: 'done'
  }
  yield { type: 'step', id: 's4', label: 'Comparar e ordenar', state: 'run' }
  await wait(700, signal)
  yield { type: 'step', id: 's4', label: 'Comparar e ordenar', state: 'done' }
  for (const text of chunks(ANSWER)) {
    await wait(55, signal)
    yield { type: 'text', text }
  }
  const today = new Date(now - 3 * HOUR).toISOString().slice(0, 10)
  yield {
    type: 'done',
    runId: '00000000-0000-4000-8000-00000000d0b1',
    status: 'ok',
    thoughtMs: 4000,
    searches: 2,
    chips: [
      { key: 'teamIds:cor', label: 'Corinthians', icon: 'team' },
      { key: 'date', label: 'Hoje', icon: 'cal' },
      { key: 'amenities:1', label: 'Telão', icon: 'tv' },
      { key: 'amenities:4', label: 'Área externa', icon: 'sun' },
      { key: 'radiusKm', label: 'até 3 km', icon: 'pin' }
    ],
    sources: bars.map((b, i) => ({
      barId: b.id,
      name: b.name,
      photoUrl: b.photo_url,
      why:
        ['Página do bar · agenda', 'Página do bar · avaliações'][i] ??
        'Página do bar · movimento'
    })),
    suggestions: ['Só com oferta da casa', 'E amanhã?', 'Qual tem mesa?'],
    remainingToday: 7,
    // Vila Madalena: tirar um chip consulta bares de verdade no banco local.
    search: {
      lat: -23.5535,
      lng: -46.6911,
      radiusKm: 3,
      date: today,
      amenities: [1, 4],
      neighborhood: null
    }
  }
}

async function* proposal(
  signal: AbortSignal,
  now: number
): AsyncGenerator<ChatEvent> {
  yield { type: 'step', id: 's1', label: 'Entendi o pedido', state: 'run' }
  await wait(600, signal)
  yield {
    type: 'step',
    id: 's1',
    label: 'Entendi o pedido',
    state: 'done',
    tags: ['Bar do Zé', 'Marina']
  }
  await wait(300, signal)
  yield {
    type: 'tool',
    id: 't1',
    name: 'marcar_vou_assistir',
    label: 'Marcar presença',
    state: 'wait',
    params: [
      ['bar', 'Bar do Zé'],
      ['jogo', 'COR × PAL · 21:30'],
      ['chamar', 'Marina Costa']
    ]
  }
  const [ze] = dublaBars(now)
  yield {
    type: 'proposal',
    proposal: {
      id: 'dubla-proposta',
      bar: { id: ze?.id ?? '', name: 'Bar do Zé', photoUrl: photo },
      game: {
        id: 'ev-dubla-1',
        title: 'Corinthians × Palmeiras',
        startsAt: tonight(now)
      },
      actions: [
        {
          kind: 'going',
          label: 'Marcar “Vou assistir aqui” e gerar seu código',
          on: true
        },
        {
          kind: 'call',
          friendId: 'dubla-marina',
          label: 'Chamar Marina Costa',
          on: true
        },
        { kind: 'remind', label: 'Me lembrar 1 h antes', on: false }
      ]
    }
  }
  yield {
    type: 'done',
    runId: '00000000-0000-4000-8000-00000000d0b2',
    status: 'ok',
    thoughtMs: 1000,
    searches: 0,
    chips: [],
    sources: [],
    suggestions: ['Como chego lá?', 'Quem mais vai?', 'Me lembra 1 h antes'],
    remainingToday: 6,
    search: null
  }
}

export async function dublaConfirm(
  input: ConfirmInput,
  now = Date.now()
): Promise<ConfirmResult> {
  await new Promise((resolve) => setTimeout(resolve, 700))
  return {
    going: input.actions.going
      ? {
          ok: true,
          code: 'A7K29',
          eventTitle: 'Corinthians × Palmeiras',
          startsAt: tonight(now),
          barName: 'Bar do Zé',
          neighborhood: 'Vila Madalena'
        }
      : null,
    call: input.actions.call ? { ok: true, friendName: 'Marina Costa' } : null,
    remind: input.actions.remind ? { ok: true } : null,
    at: clock(now)
  }
}
