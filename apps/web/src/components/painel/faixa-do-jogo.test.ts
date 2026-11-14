import { describe, expect, it } from 'bun:test'
import { faixaDoJogo, paraOJogo } from './faixa-do-jogo'

const numbers = {
  eventId: 'e',
  interested: 38,
  interestedLastDay: 12,
  views: 96,
  barsInNeighborhood: 1,
  vsAverage: 24,
  firstTime: null as number | null
}
const base = {
  numbers,
  startsAt: '2026-11-12T00:00:00Z',
  now: Date.parse('2026-11-10T21:00:00Z'),
  neighborhood: 'Consolação'
}

describe('faixa do jogo publicado', () => {
  it('antes: interesse com o de ontem, bairro e horas para o jogo', () => {
    expect(faixaDoJogo({ ...base, state: 'upcoming' })).toEqual([
      { valor: '38', rotulo: 'se interessaram', extra: '+12 desde ontem' },
      { valor: '1', rotulo: 'outro bar de Consolação com ele' },
      { valor: '27 h', rotulo: 'para o jogo' }
    ])
  })

  it('ao vivo no Elite: quem vai e quem chegou', () => {
    const faixa = faixaDoJogo({
      ...base,
      state: 'live',
      going: { going: 34, arrived: 12 }
    })
    expect(faixa?.map((c) => c.valor)).toEqual(['34', '12', '1'])
  })

  it('ao vivo no Elite com primeira vez: ela entra no lugar do bairro', () => {
    const faixa = faixaDoJogo({
      ...base,
      numbers: { ...numbers, firstTime: 5 },
      state: 'live',
      going: { going: 34, arrived: 12 }
    })
    expect(faixa?.[2]).toEqual({ valor: '5', rotulo: 'primeira vez no bar' })
    expect(
      faixaDoJogo({
        ...base,
        numbers: { ...numbers, firstTime: 0 },
        state: 'live',
        going: { going: 3, arrived: 0 }
      })?.[2]?.valor
    ).toBe('0')
  })

  it('depois, no Elite: quem veio pela primeira vez sob "viram o bar"', () => {
    const faixa = (firstTime: number | null) =>
      faixaDoJogo({
        ...base,
        numbers: { ...numbers, firstTime },
        state: 'past'
      })?.[0]?.extra
    expect(faixa(5)).toBe('5 vieram pela primeira vez')
    expect(faixa(1)).toBe('1 veio pela primeira vez')
    expect(faixa(0)).toBeUndefined()
    expect(faixa(null)).toBeUndefined()
  })

  it('depois: comparação com a média, ou o aviso sem ela', () => {
    expect(faixaDoJogo({ ...base, state: 'past' })?.[2]?.valor).toBe('▲ 24%')
    expect(
      faixaDoJogo({
        ...base,
        state: 'past',
        numbers: { ...numbers, vsAverage: null }
      })?.[2]?.valor
    ).toBe('—')
  })

  it('sem números, sem faixa; dias depois de 48 h', () => {
    expect(faixaDoJogo({ ...base, numbers: undefined, state: 'past' })).toBe(
      null
    )
    expect(paraOJogo(3 * 24 * 3_600_000)).toBe('3 dias')
  })
})
