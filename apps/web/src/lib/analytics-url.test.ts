import { describe, expect, test } from 'bun:test'
import { limparEvento, semDadosSensiveis } from './analytics-url'

// REPORT.md §6: o token do reset de senha ia ao PostHog no `$current_url`.
describe('URL sem dados sensíveis para o PostHog', () => {
  test('tira token, cookie e code e mantém o resto', () => {
    expect(
      semDadosSensiveis('https://www.onside.sh/reset-password?token=abc&x=1')
    ).toBe('https://www.onside.sh/reset-password?x=1')
    expect(
      semDadosSensiveis('https://www.onside.sh/verified?cookie=s%3D1')
    ).toBe('https://www.onside.sh/verified')
    expect(semDadosSensiveis('https://www.onside.sh/a?code=K7MP2X')).toBe(
      'https://www.onside.sh/a'
    )
    expect(semDadosSensiveis('https://www.onside.sh/dashboard?dia=1')).toBe(
      'https://www.onside.sh/dashboard?dia=1'
    )
  })

  test('o que não é URL perde a query', () => {
    expect(semDadosSensiveis('/reset-password?token=abc')).toBe(
      '/reset-password'
    )
  })

  test('before_send limpa evento e propriedades da pessoa', () => {
    const evento = limparEvento({
      properties: {
        $current_url: 'https://www.onside.sh/reset-password?token=abc',
        $referrer: 'https://www.onside.sh/x?token=def',
        outra: 'token=fica'
      },
      $set_once: {
        $initial_current_url: 'https://www.onside.sh/reset-password?token=abc'
      }
    })
    expect(evento?.properties?.$current_url).toBe(
      'https://www.onside.sh/reset-password'
    )
    expect(evento?.properties?.$referrer).toBe('https://www.onside.sh/x')
    expect(evento?.properties?.outra).toBe('token=fica')
    expect(evento?.$set_once?.$initial_current_url).toBe(
      'https://www.onside.sh/reset-password'
    )
    expect(limparEvento(null)).toBeNull()
  })
})
