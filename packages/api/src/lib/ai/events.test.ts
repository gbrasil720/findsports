import { describe, expect, it } from 'bun:test'

import { cleanSuggestions, eventQueue, renumberCitations } from './events'

const ZE = { id: 'ze' }
const CASA = { id: 'casa' }

describe('citações [[n]]', () => {
  it('renumera pela lista conferida e tira a do bar inventado', () => {
    expect(
      renumberCitations(
        'O **Zé** [[1]], o **Fake** [[2]] e a **Casa** [[3]].',
        ['ze', 'fake', 'casa'],
        [ZE, CASA]
      )
    ).toBe('O **Zé** [[1]], o **Fake** e a **Casa** [[2]].')
  })

  it('fora do intervalo sai', () => {
    expect(
      renumberCitations('O **Zé** [[1]] e [[4]] [[0]].', ['ze'], [ZE])
    ).toBe('O **Zé** [[1]] e.')
  })

  it('resposta em texto (sem responder): só vale n dentro da lista', () => {
    expect(renumberCitations('A [[1]] e B [[2]].', null, [ZE])).toBe(
      'A [[1]] e B.'
    )
  })
})

describe('sugestões', () => {
  it('no máximo 3, sem repetir, sem "Ver no mapa" e sem texto longo', () => {
    expect(
      cleanSuggestions([
        'Ver no mapa',
        'E amanhã?',
        'e amanhã?',
        42,
        'Uma pergunta comprida demais para caber num botão de sugestão',
        'Só com oferta da casa',
        'Mais barato',
        'Quem mais vai?'
      ])
    ).toEqual(['E amanhã?', 'Só com oferta da casa', 'Mais barato'])
    expect(cleanSuggestions('não é lista')).toEqual([])
  })
})

describe('fila de eventos', () => {
  it('entrega na ordem, conforme chegam, e fecha', async () => {
    const queue = eventQueue<number>()
    const got: number[] = []
    const reading = (async () => {
      for await (const n of queue.drain()) got.push(n)
    })()
    queue.push(1)
    await Promise.resolve()
    queue.push(2)
    await new Promise((r) => setTimeout(r, 1))
    expect(got).toEqual([1, 2])
    queue.push(3)
    queue.close()
    await reading
    expect(got).toEqual([1, 2, 3])
  })
})
