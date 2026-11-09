import { describe, expect, it } from 'bun:test'
import { getInterestRate, sumAnalyticsActions } from './admin-model'

describe('admin analytics display helpers', () => {
  it('never reports an interest rate above 100% (WEB-251)', () => {
    // Um visitante que abriu WhatsApp e rota: duas ações, uma pessoa.
    expect(getInterestRate(1, 1)).toBe(1)
    // Interessado sem abertura contada na janela não estoura o teto.
    expect(getInterestRate(2, 1)).toBe(1)
    expect(getInterestRate(1, 4)).toBe(0.25)
    expect(getInterestRate(1, 0)).toBeNull()
  })

  it('sums actions only when every channel is visible', () => {
    expect(
      sumAnalyticsActions({
        directionsOpened: 3,
        phoneClicked: 2,
        whatsappOpened: 1
      })
    ).toBe(6)
    expect(
      sumAnalyticsActions({
        directionsOpened: null,
        phoneClicked: null,
        whatsappOpened: null
      })
    ).toBeNull()
  })
})
