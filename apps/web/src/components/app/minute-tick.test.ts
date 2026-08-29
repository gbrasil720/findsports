import { describe, expect, it } from 'bun:test'

import { currentMinute, msUntilNextMinute } from './minute-tick'

const MINUTO = 60_000

describe('relógio de minuto (ESC-17)', () => {
  it('espera o restante do minuto corrente', () => {
    // 20:00:13 → faltam 47 segundos para as 20:01.
    expect(msUntilNextMinute(13_000)).toBe(47_000)
    expect(msUntilNextMinute(59_999)).toBe(1)
  })

  it('exatamente na virada, espera o minuto inteiro', () => {
    // Sem isto, o agendamento dispararia duas vezes no mesmo instante.
    expect(msUntilNextMinute(0)).toBe(MINUTO)
    expect(msUntilNextMinute(5 * MINUTO)).toBe(MINUTO)
  })

  it('nunca agenda para o passado nem para zero', () => {
    for (let ms = 0; ms < MINUTO; ms += 997) {
      const espera = msUntilNextMinute(ms)
      expect(espera).toBeGreaterThan(0)
      expect(espera).toBeLessThanOrEqual(MINUTO)
    }
  })

  it('o alinhamento faz a virada cair na hora certa', () => {
    // Um jogo às 20:00 com intervalo fixo de 60s a partir da montagem só
    // apareceria como ao vivo quase um minuto depois. Alinhado, o próximo
    // disparo cai exatamente na virada.
    const montagemEm = 13_000
    expect(montagemEm + msUntilNextMinute(montagemEm)).toBe(MINUTO)
  })

  it('o minuto só muda na virada', () => {
    expect(currentMinute(0)).toBe(0)
    expect(currentMinute(59_999)).toBe(0)
    expect(currentMinute(60_000)).toBe(1)
    expect(currentMinute(119_999)).toBe(1)
  })
})
