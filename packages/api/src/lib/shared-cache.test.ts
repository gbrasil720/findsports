import { describe, expect, it } from 'bun:test'

import { createSharedCache, type RedisClient } from './shared-cache'

describe('cache compartilhado', () => {
  it('sem credencial Redis usa memória e se comporta como TtlCache', async () => {
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

  it('clear apaga a entrada no Redis, e só as do próprio prefixo', async () => {
    const store = new Map<string, unknown>([['outro:k', 'fica']])
    let chaves: string[] = []
    const redis: RedisClient = {
      get: async <T>(key: string) => (store.get(key) as T) ?? null,
      set: async (key, value) => store.set(key, value),
      // Uma chave por página, para o laço do cursor ser exercitado.
      scan: async (cursor, { match }) => {
        const i = Number(cursor)
        if (i === 0) {
          const prefixo = match.slice(0, -1)
          chaves = [...store.keys()].filter((k) => k.startsWith(prefixo))
        }
        const proximo = i + 1 < chaves.length ? String(i + 1) : '0'
        return [proximo, chaves.slice(i, i + 1)]
      },
      del: async (...keys) => {
        for (const k of keys) store.delete(k)
      }
    }
    const cache = createSharedCache<number>({
      prefix: 'teste',
      ttlMs: 60_000,
      redis: async () => redis
    })
    let valor = 1
    expect(await cache.get('a', async () => valor)).toBe(1)
    expect(await cache.get('b', async () => valor)).toBe(1)

    valor = 2
    // Ainda servido pelo Redis: sem clear, o valor novo não aparece.
    expect(await cache.get('a', async () => valor)).toBe(1)

    await cache.clear()
    expect(store.has('teste:a')).toBe(false)
    expect(store.has('teste:b')).toBe(false)
    expect(store.get('outro:k')).toBe('fica')
    expect(await cache.get('a', async () => valor)).toBe(2)
  })
})
