import { describe, expect, it } from 'bun:test'

import { createTtlCache } from './ttl-cache'

function relogioFalso(inicio = 0) {
  let agora = inicio
  return {
    now: () => agora,
    avancar: (ms: number) => {
      agora += ms
    }
  }
}

describe('cache com expiração (ESC-08)', () => {
  it('carrega uma vez e reaproveita dentro do TTL', async () => {
    const relogio = relogioFalso()
    const cache = createTtlCache<number>({ ttlMs: 1000, now: relogio.now })
    let cargas = 0
    const load = async () => {
      cargas++
      return 42
    }

    expect(await cache.get('k', load)).toBe(42)
    expect(await cache.get('k', load)).toBe(42)
    relogio.avancar(999)
    expect(await cache.get('k', load)).toBe(42)
    expect(cargas).toBe(1)
  })

  it('recarrega depois do TTL', async () => {
    const relogio = relogioFalso()
    const cache = createTtlCache<number>({ ttlMs: 1000, now: relogio.now })
    let cargas = 0
    const load = async () => ++cargas

    await cache.get('k', load)
    relogio.avancar(1001)
    await cache.get('k', load)
    expect(cargas).toBe(2)
  })

  it('chaves diferentes não se misturam', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    expect(await cache.get('a', async () => 'valor-a')).toBe('valor-a')
    expect(await cache.get('b', async () => 'valor-b')).toBe('valor-b')
    expect(await cache.get('a', async () => 'nao-deveria-carregar')).toBe(
      'valor-a'
    )
  })

  it('requisições simultâneas na chave fria disparam UMA carga', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 })
    let cargas = 0
    const load = async () => {
      cargas++
      await new Promise((r) => setTimeout(r, 10))
      return 7
    }

    const resultados = await Promise.all([
      cache.get('k', load),
      cache.get('k', load),
      cache.get('k', load)
    ])

    expect(resultados).toEqual([7, 7, 7])
    expect(cargas).toBe(1)
  })

  it('carga que falha não fica presa nem é guardada', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 })
    await expect(
      cache.get('k', async () => {
        throw new Error('banco fora')
      })
    ).rejects.toThrow('banco fora')

    // A chave precisa continuar carregável depois do erro.
    expect(await cache.get('k', async () => 5)).toBe(5)
    expect(cache.size()).toBe(1)
  })

  it('respeita o teto de chaves', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, maxEntries: 2 })
    await cache.get('a', async () => 1)
    await cache.get('b', async () => 2)
    await cache.get('c', async () => 3)
    expect(cache.size()).toBe(2)
  })

  it('clear esvazia', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 })
    await cache.get('k', async () => 1)
    expect(cache.size()).toBe(1)
    cache.clear()
    expect(cache.size()).toBe(0)
  })
})
