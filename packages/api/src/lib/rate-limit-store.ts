import { db, sql } from '@findsports_oficial/db'

export type JanelaLimite = {
  max: number
  windowMs: number
}

export type DecisaoRateLimit = {
  allowed: boolean
  retryAfterMs: number
  count: number
}

/**
 * Contador de janela fixa na tabela `rate_limit`, compartilhado por todas as
 * instâncias serverless. Um único upsert: duas requisições simultâneas fazem
 * fila na linha e cada uma recebe a própria contagem, em vez de as duas lerem
 * o mesmo número antes de escrever.
 */
export async function incrementWindow(
  key: string,
  limite: JanelaLimite
): Promise<DecisaoRateLimit> {
  const now = Date.now()
  const result = await db.execute(sql`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN ${now} - rate_limit.last_request >= ${limite.windowMs} THEN 1
        ELSE rate_limit.count + 1
      END,
      last_request = CASE
        WHEN ${now} - rate_limit.last_request >= ${limite.windowMs} THEN ${now}
        ELSE rate_limit.last_request
      END
    RETURNING count
  `)
  const count = Number(
    (result.rows[0] as { count: string | number } | undefined)?.count ?? 0
  )
  return {
    allowed: count <= limite.max,
    retryAfterMs: count <= limite.max ? 0 : limite.windowMs,
    count
  }
}

/**
 * Devolve uma tentativa consumida por `incrementWindow`. Serve a quem cobra
 * antes de saber o desfecho e só quer contar as falhas.
 */
export async function refundWindowAttempt(key: string): Promise<void> {
  await db.execute(sql`
    UPDATE rate_limit
    SET count = GREATEST(count - 1, 0)
    WHERE key = ${key}
  `)
}
