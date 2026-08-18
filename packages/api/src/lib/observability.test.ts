import { describe, expect, it } from 'bun:test'

import {
  LIMITE_LENTIDAO_MS,
  montarLinhaDeLog,
  nivelDoLog
} from './observability'

const base = {
  path: 'pubs.search',
  type: 'query' as const,
  durationMs: 42,
  ok: true
}

describe('linha de log (ESC-18)', () => {
  it('registra o essencial para investigar', () => {
    expect(montarLinhaDeLog(base)).toEqual({
      evt: 'trpc',
      path: 'pubs.search',
      type: 'query',
      ms: 42,
      ok: true,
      slow: false
    })
  })

  it('arredonda a duração', () => {
    expect(montarLinhaDeLog({ ...base, durationMs: 42.7 }).ms).toBe(43)
  })

  it('marca chamada lenta', () => {
    expect(
      montarLinhaDeLog({ ...base, durationMs: LIMITE_LENTIDAO_MS }).slow
    ).toBe(true)
    expect(
      montarLinhaDeLog({ ...base, durationMs: LIMITE_LENTIDAO_MS - 1 }).slow
    ).toBe(false)
  })

  it('inclui o código do erro, e só ele', () => {
    const linha = montarLinhaDeLog({
      ...base,
      ok: false,
      errorCode: 'FORBIDDEN'
    })
    expect(linha.code).toBe('FORBIDDEN')
    expect(linha.ok).toBe(false)
  })

  it('nunca carrega entrada do usuário nem identificador de pessoa', () => {
    // O contrato é a forma da linha: se alguém acrescentar `input` ou
    // `userId` no futuro, este teste quebra antes de o dado ir para o log.
    const linha = montarLinhaDeLog({ ...base, ok: false, errorCode: 'X' })
    expect(Object.keys(linha).sort()).toEqual([
      'code',
      'evt',
      'ms',
      'ok',
      'path',
      'slow',
      'type'
    ])
  })
})

describe('severidade do log (ESC-18)', () => {
  it('sucesso rápido é informação', () => {
    expect(nivelDoLog(base)).toBe('info')
  })

  it('sucesso lento merece atenção', () => {
    expect(nivelDoLog({ ...base, durationMs: 900 })).toBe('warn')
  })

  it('recusa de negócio não é defeito', () => {
    // Sem esta distinção, o volume normal de UNAUTHORIZED afogaria os
    // defeitos reais no mesmo nível.
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_REQUEST',
      'CONFLICT',
      'TOO_MANY_REQUESTS'
    ]) {
      expect(nivelDoLog({ ...base, ok: false, errorCode: code })).toBe('warn')
    }
  })

  it('erro inesperado é erro', () => {
    expect(
      nivelDoLog({ ...base, ok: false, errorCode: 'INTERNAL_SERVER_ERROR' })
    ).toBe('error')
    expect(nivelDoLog({ ...base, ok: false })).toBe('error')
  })
})
