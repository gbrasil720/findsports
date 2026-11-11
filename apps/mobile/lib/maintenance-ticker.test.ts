import { describe, expect, it } from 'bun:test'
import { shortTitle, tickerItem } from './maintenance-ticker'

const time = () => '21:30'

describe('tickerItem', () => {
  it('confronto vira três letras de cada lado, sem acento', () => {
    expect(
      tickerItem(
        { title: 'Flamengo × Palmeiras', startsAt: 'x', live: false },
        time
      )
    ).toBe('FLA × PAL 21:30')
    expect(
      tickerItem(
        { title: 'São Paulo × Grêmio', startsAt: 'x', live: true },
        time
      )
    ).toBe('SAO × GRE AO VIVO')
  })
  it('corrida vai inteira', () => {
    expect(
      tickerItem({ title: 'GP de Las Vegas', startsAt: 'x', live: false }, time)
    ).toBe('GP DE LAS VEGAS 21:30')
  })
})

describe('shortTitle', () => {
  it('Fla × Pal', () => {
    expect(shortTitle('Flamengo × Palmeiras')).toBe('Fla × Pal')
    expect(shortTitle('GP de Las Vegas')).toBe('GP de Las Vegas')
  })
})
