/**
 * Cache compartilhado com fallback.
 *
 * Se existir Upstash/Vercel KV (`KV_REST_*` ou `UPSTASH_REDIS_REST_*`), as
 * instâncias serverless passam a ver o mesmo store. Sem credencial — ou se o
 * Redis falhar — cai no `TtlCache` em memória da instância.
 *
 * Mesma regra do cache local: só dado global. Nada de sessão.
 */

import { createTtlCache, type TtlCache } from './ttl-cache'

export type SharedCacheOptions = {
  prefix: string
  ttlMs: number
  maxEntries?: number
}

type RedisClient = {
  get: <T>(key: string) => Promise<T | null>
  set: (key: string, value: unknown, opts: { px: number }) => Promise<unknown>
}

function credenciaisRedis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token }
}

let redisPromise: Promise<RedisClient | null> | null = null

function redisOpcional() {
  if (!redisPromise) {
    redisPromise = (async () => {
      const credenciais = credenciaisRedis()
      if (!credenciais) return null
      try {
        const { Redis } = await import('@upstash/redis')
        return new Redis(credenciais) as RedisClient
      } catch {
        return null
      }
    })()
  }
  return redisPromise
}

export function createSharedCache<T>(options: SharedCacheOptions): TtlCache<T> {
  const memoria = createTtlCache<T>({
    ttlMs: options.ttlMs,
    maxEntries: options.maxEntries
  })
  if (!credenciaisRedis()) return memoria

  const inFlight = new Map<string, Promise<T>>()

  return {
    async get(key, load) {
      const cheia = `${options.prefix}:${key}`
      const redis = await redisOpcional()
      if (!redis) return memoria.get(key, load)

      try {
        const hit = await redis.get<T>(cheia)
        if (hit !== null && hit !== undefined) return hit
      } catch {
        return memoria.get(key, load)
      }

      const emAndamento = inFlight.get(cheia)
      if (emAndamento) return emAndamento

      const promessa = load()
        .then(async (value) => {
          try {
            await redis.set(cheia, value, { px: options.ttlMs })
          } catch {
            // Falha de escrita não pode derrubar a requisição.
          }
          return value
        })
        .finally(() => {
          inFlight.delete(cheia)
        })

      inFlight.set(cheia, promessa)
      return promessa
    },
    clear() {
      memoria.clear()
      inFlight.clear()
    },
    size() {
      return memoria.size()
    }
  }
}
