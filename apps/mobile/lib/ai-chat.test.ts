import { describe, expect, it } from 'bun:test'

import {
  answerPins,
  applyEvent,
  barsFound,
  boldSegments,
  chatHistory,
  chipSearch,
  citationPieces,
  confirmText,
  conversationDate,
  followUps,
  fromSearchBar,
  historyOf,
  inNeighborhood,
  mapFocus,
  newTurn,
  patchVersion,
  plainText,
  type Recent,
  recentMeta,
  recentWhen,
  redoTurn,
  resumeLabel,
  saveRecent,
  shownReply,
  sourcesLabel,
  startReply,
  stepVersion,
  thoughtLabel,
  versionLabel
} from './ai-chat'
import type { ChatBar, ChatEvent, FilterChip } from './ai-events'

const bar = (id: string) => ({ id }) as ChatBar

describe('busca com IA (Rodada 24)', () => {
  it('negrito da resposta', () => {
    expect(boldSegments('Achei **Corinthians × Palmeiras** hoje.')).toEqual([
      { text: 'Achei ', bold: false },
      { text: 'Corinthians × Palmeiras', bold: true },
      { text: ' hoje.', bold: false }
    ])
    // Asterisco solto não vira marca nem sobra na tela.
    expect(boldSegments('Sem **fim')).toEqual([
      { text: 'Sem fim', bold: false }
    ])
  })

  it('citações: número de cada bar, fora do intervalo sai', () => {
    expect(
      citationPieces('O **Bar do Zé** [[1]] é perto; o Casa [[3]] não.', 2)
    ).toEqual([
      { text: 'O ', bold: false },
      { text: 'Bar do Zé', bold: true },
      { text: ' ', bold: false },
      { cite: 1 },
      { text: ' é perto; o Casa ', bold: false },
      { text: ' não.', bold: false }
    ])
    expect(citationPieces('Nenhum [[0]] bar', 3)).toEqual([
      { text: 'Nenhum ', bold: false },
      { text: ' bar', bold: false }
    ])
  })

  it('citações em pedaços: a marca começada no fim espera o resto', () => {
    const chunks = ['O **Zé** [', '[1', ']] é perto']
    const seen: string[] = []
    let text = ''
    for (const chunk of chunks) {
      text += chunk
      seen.push(
        citationPieces(text, 1)
          .map((p) => ('cite' in p ? `(${p.cite})` : p.text))
          .join('')
      )
    }
    expect(seen).toEqual(['O Zé ', 'O Zé ', 'O Zé (1) é perto'])
  })

  it('texto para copiar sai sem marcas', () => {
    expect(plainText('O **Bar do Zé** [[1]] é o mais perto.')).toBe(
      'O Bar do Zé é o mais perto.'
    )
  })

  it('eventos montam a resposta: passo atualiza pelo id, texto acumula', () => {
    const events: ChatEvent[] = [
      { type: 'step', id: 's1', label: 'Entendi o pedido', state: 'run' },
      {
        type: 'step',
        id: 's1',
        label: 'Entendi o pedido',
        state: 'done',
        tags: ['Hoje']
      },
      { type: 'step', id: 's2', label: 'Procurando', state: 'run' },
      {
        type: 'tool',
        id: 't1',
        name: 'buscar_bares',
        label: 'Bares com o jogo',
        state: 'run'
      },
      { type: 'bars', bars: [bar('a')] },
      {
        type: 'tool',
        id: 't1',
        name: 'buscar_bares',
        label: 'Bares com o jogo',
        state: 'done',
        output: '1 bar'
      },
      { type: 'text', text: 'Achei ' },
      { type: 'text', text: 'um bar.' },
      {
        type: 'done',
        runId: 'r',
        status: 'ok',
        thoughtMs: 3600,
        searches: 2,
        chips: [],
        sources: [],
        suggestions: [],
        remainingToday: 9
      }
    ]
    let reply = startReply(1000)
    const times = [1000, 1200, 1300, 1500, 2000, 2100, 4600, 4700, 5000]
    events.forEach((e, i) => {
      reply = applyEvent(reply, e, times[i] ?? 0)
    })
    expect(reply.steps).toHaveLength(2)
    expect(reply.steps.every((s) => s.state === 'done')).toBe(true)
    expect(reply.steps[0]?.tags).toEqual(['Hoje'])
    expect(reply.tools).toHaveLength(1)
    expect(reply.text).toBe('Achei um bar.')
    expect(reply.state).toBe('done')
    // O pensamento acaba no primeiro texto.
    expect(reply.thoughtAt).toBe(4600)
    expect(thoughtLabel(reply)).toBe('Pensou por 4 s · 2 buscas')
  })

  it('limite e fora do ar viram estados da resposta', () => {
    const limit = applyEvent(
      startReply(0),
      {
        type: 'blocked',
        reason: 'limit',
        scope: 'day',
        resumesAt: '2026-10-23T03:00:00Z'
      },
      0
    )
    expect(limit.state).toBe('limit')
    expect(limit.limit?.scope).toBe('day')
    expect(
      applyEvent(startReply(0), { type: 'blocked', reason: 'unavailable' }, 0)
        .state
    ).toBe('unavailable')
    // Caiu depois do texto (sem done): o que chegou fica.
    let reply = applyEvent(startReply(0), { type: 'bars', bars: [bar('a')] }, 0)
    reply = applyEvent(reply, { type: 'text', text: 'Achei um.' }, 10)
    reply = applyEvent(reply, { type: 'blocked', reason: 'unavailable' }, 20)
    expect(reply.state).toBe('unavailable')
    expect(reply.text).toBe('Achei um.')
    expect(reply.bars).toHaveLength(1)
  })

  it('refazer: versão nova na tela, "2/2", anda sem passar das pontas', () => {
    let turn = newTurn(1, 'oi', 0)
    expect(versionLabel(turn)).toBeNull()
    turn = patchVersion(turn, 0, (r) => ({ ...r, text: 'primeira' }))
    turn = redoTurn(turn, 10)
    expect(turn.shown).toBe(1)
    expect(versionLabel(turn)).toBe('2/2')
    expect(shownReply(turn).text).toBe('')
    turn = stepVersion(turn, -1)
    expect(versionLabel(turn)).toBe('1/2')
    expect(shownReply(turn).text).toBe('primeira')
    expect(stepVersion(turn, -1).shown).toBe(0)
    expect(stepVersion(stepVersion(turn, 1), 1).shown).toBe(1)
  })

  it('histórico usa a versão na tela, sem marcas', () => {
    const turn = patchVersion(newTurn(1, 'oi', 0), 0, (r) => ({
      ...r,
      text: 'O **Zé** [[1]] passa.'
    }))
    expect(historyOf([turn, newTurn(2, 'e amanhã?', 0)])).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'O Zé passa.' }
    ])
  })

  it('recentes: no topo, sem repetir, até 20', () => {
    const entry = (id: string, at = 0): Recent => ({
      id,
      title: id,
      at,
      bars: 0,
      turns: []
    })
    let list: Recent[] = []
    for (let i = 0; i < 25; i++) list = saveRecent(list, entry(`c${i}`))
    expect(list).toHaveLength(20)
    expect(list[0]?.id).toBe('c24')
    list = saveRecent(list, entry('c10', 5))
    expect(list[0]?.id).toBe('c10')
    expect(list.filter((r) => r.id === 'c10')).toHaveLength(1)
    expect(list).toHaveLength(20)
  })

  it('recentes: quando e quantos bares', () => {
    const now = new Date('2026-10-22T19:00:00Z').getTime()
    const hour = 3_600_000
    expect(recentWhen(now - hour, now)).toBe('Hoje')
    expect(recentWhen(now - 24 * hour, now)).toBe('Ontem')
    // 19/10/2026 é segunda.
    expect(recentWhen(now - 3 * 24 * hour, now)).toBe('Seg')
    expect(recentWhen(now - 10 * 24 * hour, now)).toBe('12/10')
    const turn = patchVersion(newTurn(1, 'oi', 0), 0, (r) => ({
      ...r,
      bars: [bar('a'), bar('b'), bar('c')]
    }))
    expect(barsFound([turn])).toBe(3)
    expect(
      recentMeta(
        { id: 'x', title: 'oi', at: now - 24 * hour, bars: 3, turns: [] },
        now
      )
    ).toBe('Ontem · 3 bares')
  })

  it('tirar um chip refaz a busca com os que sobram', () => {
    const chips: FilterChip[] = [
      { key: 'teamIds:cor', label: 'Corinthians', icon: 'team' },
      { key: 'date:2026-10-22', label: 'Hoje', icon: 'cal' },
      { key: 'amenities:1', label: 'Telão', icon: 'tv' },
      { key: 'amenities:4', label: 'Área externa', icon: 'sun' },
      { key: 'radiusKm:3', label: 'até 3 km', icon: 'pin' },
      { key: 'neighborhood:Pinheiros', label: 'Pinheiros', icon: 'pin' }
    ]
    const here = { lat: -23.56, lng: -46.69 }
    expect(chipSearch(chips, ['amenities:4', 'teamIds:cor'], here)).toEqual({
      input: {
        lat: -23.56,
        lng: -46.69,
        limit: 20,
        date: '2026-10-22',
        amenities: [1],
        radiusKm: 3
      },
      neighborhood: 'Pinheiros'
    })
    // O chip de cidade pedida ganha do local do campo; sem local, sem busca.
    const city = [
      ...chips,
      { key: 'origin:-22.9,-43.2', label: 'Rio', icon: 'pin' as const }
    ]
    expect(chipSearch(city, [], here)?.input.lat).toBe(-22.9)
    expect(chipSearch(chips, [], null)).toBeNull()
    expect(
      inNeighborhood(
        [
          { id: 'a', neighborhood: 'Pinheiros' },
          { id: 'b', neighborhood: 'Vila Madalena' },
          { id: 'c', neighborhood: null }
        ],
        'pinheiros'
      ).map((b) => b.id)
    ).toEqual(['a'])
    // Sem bares, o ponto da busca num quadro de 2× o raio.
    expect(mapFocus([], chips, here, 5)).toEqual({
      ...here,
      kmTall: 6,
      kmWide: 6
    })
    expect(mapFocus([], chips, null, 5)).toBeNull()
  })

  it('"Ver no mapa" enquadra os bares da resposta e o ponto da busca (WEB-432)', () => {
    const at = (latitude: number, longitude: number) =>
      ({ latitude, longitude }) as ChatBar
    const here = { lat: -23.56, lng: -46.69 }
    // Bares ao norte e a leste do ponto: o quadro vai do ponto ao bar mais
    // longe, com folga, e o centro fica entre eles.
    const box = mapFocus(
      [at(-23.53, -46.69), at(-23.56, -46.66), at(Number.NaN, 0)],
      [],
      here,
      3
    )
    expect(box?.lat).toBeCloseTo(-23.545, 6)
    expect(box?.lng).toBeCloseTo(-46.675, 6)
    expect(box?.kmTall).toBeCloseTo(0.03 * 111 * 1.4, 6)
    expect(box?.kmWide).toBeCloseTo(
      0.03 * 111.32 * Math.cos((-23.545 * Math.PI) / 180) * 1.4,
      6
    )
    // Sem ponto da busca, só os bares; um bar só (ou colados) não fecha o
    // mapa abaixo de 1,6 km.
    expect(mapFocus([at(-23.5, -46.6)], [], null, 3)).toEqual({
      lat: -23.5,
      lng: -46.6,
      kmTall: 1.6,
      kmWide: 1.6
    })
  })

  it('bares da resposta viram gotas no Explorar, sem repetir os dele', () => {
    const chat = (id: string, extra: Partial<ChatBar> = {}) =>
      ({
        id,
        name: id,
        latitude: -23.55,
        longitude: -46.69,
        distanceKm: null,
        plan: null,
        game: null,
        ...extra
      }) as ChatBar
    const pins = answerPins(
      [
        chat('a'),
        chat('b', {
          plan: 'elite',
          distanceKm: 1.2,
          game: {
            id: 'e',
            title: 'Corinthians × Palmeiras',
            startsAt: '2026-10-24T21:30:00.000Z',
            live: true
          }
        }),
        chat('c', { latitude: Number.NaN })
      ],
      new Set(['a'])
    )
    expect(pins).toEqual([
      {
        id: 'b',
        name: 'b',
        lat: -23.55,
        lng: -46.69,
        live: true,
        elite: true,
        distanceKm: 1.2,
        next: Date.parse('2026-10-24T21:30:00.000Z'),
        label: 'b'
      }
    ])
    // Sem jogo nem distância: fica atrás no desempate dos rótulos.
    expect(answerPins([chat('d')], new Set())[0]).toMatchObject({
      live: false,
      elite: false,
      distanceKm: Number.POSITIVE_INFINITY,
      next: Number.POSITIVE_INFINITY
    })
  })

  it('bar da busca normal vira o card do chat', () => {
    const bar = fromSearchBar(
      {
        id: 'a',
        name: 'Zé',
        neighborhood: 'Pinheiros',
        latitude: '-23.5614',
        longitude: '-46.6912',
        distance_km: 0.8,
        photo_url: null,
        plan: 'pro',
        rating: { percentage: 87 },
        averageSpendCents: null,
        nextEvent: {
          id: 'e',
          startsAt: '2026-10-22T21:30:00-03:00',
          endsAt: null,
          championship: 'Brasileirão',
          participants: [
            { team: { name: 'Corinthians' } },
            { team: { name: 'Palmeiras' } }
          ],
          participantFreeText: null
        }
      },
      () => true
    )
    expect(bar.game).toEqual({
      id: 'e',
      title: 'Corinthians × Palmeiras',
      startsAt: '2026-10-22T21:30:00-03:00',
      live: true
    })
    expect(bar.ratingPercent).toBe(87)
    expect(bar.distanceKm).toBe(0.8)
    expect([bar.latitude, bar.longitude]).toEqual([-23.5614, -46.6912])
  })

  it('seguimento: até três perguntas, "Ver no mapa" em segundo com bares', () => {
    expect(followUps(['Só com oferta', 'E amanhã?'], true)).toEqual([
      { kind: 'ask', label: 'Só com oferta' },
      { kind: 'map', label: 'Ver no mapa' },
      { kind: 'ask', label: 'E amanhã?' }
    ])
    expect(followUps(['a', 'b', 'c', 'd'], false)).toHaveLength(3)
  })

  it('fontes e a frase do "Confirmar"', () => {
    const now = new Date('2026-10-22T19:00:00Z').getTime()
    const source = { barId: 'a', name: 'Zé', photoUrl: null, why: '' }
    const today: FilterChip = {
      key: 'date:2026-10-22',
      label: 'Hoje',
      icon: 'cal'
    }
    expect(sourcesLabel([source, source, source], [today], now)).toBe(
      'Usei 3 bares e a agenda de hoje'
    )
    expect(sourcesLabel([source], [], now)).toBe('Usei 1 bar')
    expect(
      confirmText({
        going: {
          ok: true,
          code: 'A7K29',
          eventTitle: 'COR × PAL',
          participants: ['COR', 'PAL'],
          startsAt: '',
          barName: 'Zé',
          neighborhood: 'Vila Madalena'
        },
        call: { ok: true, friendName: 'Marina Costa' },
        remind: null,
        at: '19:02'
      })
    ).toBe(
      'Pronto! Seu código está aqui embaixo e também em Meus jogos. Marina recebeu seu chamado. Quando tocar em “Vou também”, aparece em quem vai.'
    )
  })

  it('quando volta: amanhã, ou o dia 1º do mês seguinte', () => {
    const now = new Date('2026-10-21T18:00:00Z').getTime()
    expect(resumeLabel('2026-10-22T03:00:00.000Z', now)).toBe('amanhã à 0h')
    expect(resumeLabel('2026-11-01T03:00:00.000Z', now)).toBe(
      'em 1º de novembro'
    )
  })

  it('histórico: só trocas respondidas, as últimas', () => {
    const turns = [
      { question: 'um', answer: 'r1' },
      { question: 'dois', answer: null },
      { question: 'três', answer: 'r3' }
    ]
    expect(chatHistory(turns)).toEqual([
      { role: 'user', content: 'um' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'três' },
      { role: 'assistant', content: 'r3' }
    ])
    expect(chatHistory(turns, 2)).toHaveLength(2)
  })
})

describe('passo que ainda vem', () => {
  it('fica no fim, começa no lugar e sai se não começou', () => {
    let reply = startReply(0)
    const step = (id: string, state: 'todo' | 'run' | 'done') =>
      ({ type: 'step', id, label: id, state }) as const
    for (const e of [
      step('understood', 'done'),
      step('rank', 'todo'),
      step('search', 'run')
    ])
      reply = applyEvent(reply, e, 0)
    expect(reply.steps.map((s) => s.id)).toEqual([
      'understood',
      'search',
      'rank'
    ])
    reply = applyEvent(reply, step('rank', 'run'), 0)
    expect(reply.steps.map((s) => `${s.id}:${s.state}`)).toEqual([
      'understood:done',
      'search:run',
      'rank:run'
    ])
    const ended = applyEvent(
      applyEvent(startReply(0), step('rank', 'todo'), 0),
      {
        type: 'done',
        runId: 'r',
        status: 'ok',
        thoughtMs: 0,
        searches: 0,
        chips: [],
        sources: [],
        suggestions: [],
        remainingToday: 9
      },
      0
    )
    expect(ended.steps).toEqual([])
  })
})

it('conversationDate: de hoje a hora, de antes o mês e o dia (Brasília)', () => {
  const now = Date.parse('2026-10-29T22:00:00Z') // 19:00 em Brasília
  expect(
    conversationDate(Date.parse('2026-10-29T22:04:00Z') - 3600_000, now)
  ).toEqual({
    top: 'HOJE',
    main: '18:04',
    today: true
  })
  expect(conversationDate(Date.parse('2026-10-21T15:00:00Z'), now)).toEqual({
    top: 'OUT',
    main: '21',
    today: false
  })
  // 01:00 de 30/10 em UTC ainda é 29/10 em Brasília.
  expect(conversationDate(Date.parse('2026-10-30T01:00:00Z'), now).today).toBe(
    true
  )
})
