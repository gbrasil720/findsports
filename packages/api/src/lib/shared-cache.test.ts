import { describe, expect, it } from 'bun:test'

import { createSharedCache, temCacheCompartilhado } from './shared-cache'

describe('cache compartilhado', () => {
  it('sem credencial Redis usa memória e se comporta como TtlCache', async () => {
    expect(temCacheCompartilhado()).toBe(false)
    const cache = createSharedCache<number>({
      prefix: 'teste',
      ttlMs: 60_000
    })
    let cargas = 0
    expect(await cache.get('k', async () => ++cargas)).toBe(1)
    expect(await cache.get('k', async () => ++cargas)).toBe(1)
    expect(cargas).toBe(1)
  })

  it('requisições simultâneas na chave fria disparam uma carga', async () => {
    const cache = createSharedCache<number>({
      prefix: 'teste',
      ttlMs: 60_000
    })
    let cargas = 0
    const load = async () => {
      cargas++
      await new Promise((r) => setTimeout(r, 5))
      return 9
    }
    const resultados = await Promise.all([
      cache.get('k', load),
      cache.get('k', load),
      cache.get('k', load)
    ])
    expect(resultados).toEqual([9, 9, 9])
    expect(cargas).toBe(1)
  })
})
