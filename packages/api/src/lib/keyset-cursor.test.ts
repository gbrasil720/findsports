import { describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { decodeCursor, encodeCursor } from './keyset-cursor'

const schema = z.object({
  p: z.number(),
  e: z.string(),
  d: z.number(),
  i: z.string()
})

describe('keyset cursor', () => {
  it('faz round-trip preservando os valores', () => {
    const payload = {
      p: 2,
      e: '2026-08-16 12:00:00.000000',
      d: 11.57,
      i: 'bar-123'
    }
    expect(decodeCursor(encodeCursor(payload), schema)).toEqual(payload)
  })

  it('preserva a distância sem perder precisão', () => {
    // A distância volta do Postgres como float8; se o cursor arredondasse,
    // a página seguinte poderia repetir ou pular a linha da fronteira.
    const d = 9513.99353302616 / 1000
    const payload = { p: 1, e: 'x', d, i: 'y' }
    expect(decodeCursor(encodeCursor(payload), schema).d).toBe(d)
  })

  it('gera cursor seguro para URL', () => {
    const cursor = encodeCursor({
      p: 3,
      e: '2026-08-16 12:00:00.000000',
      d: 1,
      i: 'bar/com+sinais'
    })
    expect(cursor).not.toContain('+')
    expect(cursor).not.toContain('/')
    expect(cursor).not.toContain('=')
  })

  it('rejeita cursor que não é base64 de JSON', () => {
    expect(() => decodeCursor('não-é-um-cursor', schema)).toThrow(TRPCError)
  })

  it('rejeita cursor com formato diferente do esperado', () => {
    const cursor = encodeCursor({ campo: 'inesperado' })
    expect(() => decodeCursor(cursor, schema)).toThrow(TRPCError)
  })

  it('rejeita em vez de silenciosamente voltar à primeira página', () => {
    try {
      decodeCursor('lixo', schema)
      throw new Error('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
  })
})
