import { describe, expect, it } from 'bun:test'

import {
  comPrazo,
  espera,
  FalhaNaLeitura,
  lerComRetry,
  PrazoEsgotado
} from './r2-read'

const semEspera = (esperas: number[]) => ({
  tentativas: 3,
  prazoMs: 50,
  esperaBaseMs: 100,
  dormir: async (ms: number) => {
    esperas.push(ms)
  }
})

describe('comPrazo', () => {
  it('devolve o valor quando a leitura responde a tempo', async () => {
    expect(await comPrazo(Promise.resolve('ok'), 50)).toBe('ok')
  })

  it('rejeita com PrazoEsgotado quando a leitura não responde', async () => {
    const nunca = new Promise<string>(() => {})
    await expect(comPrazo(nunca, 10)).rejects.toBeInstanceOf(PrazoEsgotado)
  })
})

describe('lerComRetry', () => {
  it('não espera nem repete quando a primeira leitura dá certo', async () => {
    const esperas: number[] = []
    let chamadas = 0
    const valor = await lerComRetry(async () => {
      chamadas++
      return 'tile'
    }, semEspera(esperas))
    expect(valor).toBe('tile')
    expect(chamadas).toBe(1)
    expect(esperas).toEqual([])
  })

  it('tenta de novo depois de um erro passageiro do R2', async () => {
    const esperas: number[] = []
    let chamadas = 0
    const valor = await lerComRetry(async () => {
      chamadas++
      if (chamadas === 1) {
        throw new Error('We encountered an internal error. Please try again.')
      }
      return 'tile'
    }, semEspera(esperas))
    expect(valor).toBe('tile')
    expect(chamadas).toBe(2)
    expect(esperas).toHaveLength(1)
  })

  it('tenta de novo quando a leitura passa do prazo', async () => {
    let chamadas = 0
    const valor = await lerComRetry(() => {
      chamadas++
      return chamadas === 1
        ? new Promise<string>(() => {})
        : Promise.resolve('tile')
    }, semEspera([]))
    expect(valor).toBe('tile')
    expect(chamadas).toBe(2)
  })

  it('desiste depois das tentativas com FalhaNaLeitura e a causa', async () => {
    const esperas: number[] = []
    let chamadas = 0
    const erro = await lerComRetry(async () => {
      chamadas++
      throw new Error('R2 fora')
    }, semEspera(esperas)).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(FalhaNaLeitura)
    expect((erro as FalhaNaLeitura).cause).toBeInstanceOf(Error)
    expect(chamadas).toBe(3)
    expect(esperas).toHaveLength(2)
    // Exponencial: a segunda espera parte do dobro da base.
    expect(esperas[0]).toBeGreaterThanOrEqual(100)
    expect(esperas[1]).toBeGreaterThanOrEqual(200)
  })
})

describe('espera', () => {
  it('dobra a cada tentativa, com jitter de até 100%', () => {
    for (let i = 0; i < 50; i++) {
      const primeira = espera(1, 100)
      const segunda = espera(2, 100)
      expect(primeira).toBeGreaterThanOrEqual(100)
      expect(primeira).toBeLessThan(200)
      expect(segunda).toBeGreaterThanOrEqual(200)
      expect(segunda).toBeLessThan(400)
    }
  })
})
