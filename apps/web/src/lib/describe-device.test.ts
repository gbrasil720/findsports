import { describe, expect, test } from 'bun:test'

import { describeDevice } from './describe-device'

describe('describeDevice', () => {
  test('nomeia navegador e plataforma dos casos comuns', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      )
    ).toEqual({ label: 'Chrome no macOS', recognized: true })

    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toEqual({ label: 'Safari no iPhone', recognized: true })

    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
      )
    ).toEqual({ label: 'Firefox no Windows', recognized: true })
  })

  test('desempata os navegadores que se anunciam como outro', () => {
    // Edge diz Chrome, que diz Safari. Sem ordem, todo Edge viraria "Chrome"
    // e todo Chrome viraria "Safari".
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
      ).label
    ).toBe('Edge no Windows')

    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0'
      ).label
    ).toBe('Opera no macOS')
  })

  test('iPad no modo desktop não vira macOS', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1'
      ).label
    ).toBe('Safari no iPad')
  })

  test('marca como não reconhecido em vez de inventar um nome', () => {
    expect(describeDevice(null).recognized).toBe(false)
    expect(describeDevice('   ').recognized).toBe(false)
    expect(describeDevice('curl/8.6.0').recognized).toBe(false)
    expect(describeDevice(null).label).toBe('Acesso não identificado')
  })
})
