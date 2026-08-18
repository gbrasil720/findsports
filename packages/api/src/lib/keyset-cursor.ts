import { TRPCError } from '@trpc/server'
import type { z } from 'zod'

/**
 * Cursor opaco para paginação keyset (ESC-05).
 *
 * O modelo anterior era `OFFSET`: para entregar a página 10, o Postgres
 * precisava gerar e descartar todas as linhas anteriores, e o resultado ainda
 * podia duplicar ou pular itens quando a lista mudava entre requisições.
 *
 * O cursor carrega a última tupla de ordenação da página anterior. A página
 * seguinte é "tudo que vem depois desta tupla", o que o índice resolve
 * diretamente — custo constante por página, e estável sob escrita concorrente.
 *
 * É deliberadamente opaco: o cliente só devolve o que recebeu. Isso mantém a
 * liberdade de mudar as chaves de ordenação sem quebrar quem consome.
 */

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8')
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return toBase64Url(JSON.stringify(payload))
}

/**
 * Decodifica e valida um cursor. Um cursor corrompido é erro do cliente, não
 * um "começar do zero" silencioso — devolver a primeira página nesse caso
 * esconderia o bug e faria o consumidor repetir resultados para sempre.
 */
export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(cursor))
  } catch {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cursor de paginação inválido.'
    })
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cursor de paginação inválido.'
    })
  }

  return result.data
}
