import { describe, expect, it } from 'bun:test'
import { maintenanceForecast } from './maintenance-forecast'

// 28/10/2026 22:50 em Brasília (UTC−3).
const NOW = Date.parse('2026-10-29T01:50:00Z')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

describe('previsão de volta da manutenção (WEB-466)', () => {
  it('mostra a hora de Brasília e quanto falta, como no 26d', () => {
    expect(maintenanceForecast(at(40), NOW)).toEqual({
      time: '23:30',
      left: '40 min'
    })
  })

  it('arredonda de 5 em 5 a partir de 10 min e conta o minuto abaixo disso', () => {
    expect(maintenanceForecast(at(43), NOW)?.left).toBe('45 min')
    expect(maintenanceForecast(at(9), NOW)?.left).toBe('9 min')
    // Segundos que sobram contam como um minuto: nunca "0 min".
    expect(maintenanceForecast(at(0.2), NOW)?.left).toBe('1 min')
  })

  it('passa de uma hora em horas e minutos, e vira o dia', () => {
    expect(maintenanceForecast(at(58), NOW)?.left).toBe('1 h')
    expect(maintenanceForecast(at(90), NOW)).toEqual({
      time: '00:20',
      left: '1 h 30 min'
    })
  })

  it('sem previsão, inválida ou vencida: nada a mostrar', () => {
    expect(maintenanceForecast(null, NOW)).toBeNull()
    expect(maintenanceForecast('23:30', NOW)).toBeNull()
    expect(maintenanceForecast(at(0), NOW)).toBeNull()
    expect(maintenanceForecast(at(-5), NOW)).toBeNull()
  })
})
