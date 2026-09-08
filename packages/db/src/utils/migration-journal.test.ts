import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import {
  calcularHash,
  type EntradaJornal,
  lerJornal,
  planejarReconciliacao
} from './migration-journal'

function entrada(idx: number, quando: number): EntradaJornal {
  return {
    idx,
    tag: `${String(idx).padStart(4, '0')}_teste`,
    quando,
    hash: `h${idx}`
  }
}

const ENTRADAS = [entrada(0, 100), entrada(1, 200), entrada(2, 300)]

describe('calcularHash', () => {
  /**
   * O valor de referência foi calculado fora deste código. Se o `drizzle-orm`
   * mudar a forma de hashear, é aqui que se descobre — e não num banco que
   * passa a receber linha com hash que o driver não reconhece.
   */
  test('é sha256 do conteúdo cru do arquivo', () => {
    expect(calcularHash('select 1;\n')).toBe(
      '4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c'
    )
  })

  test('é sensível a espaço em branco, como o driver', () => {
    expect(calcularHash('select 1;')).not.toBe(calcularHash('select 1;\n'))
  })
})

describe('planejarReconciliacao', () => {
  test('sem nada registrado, registra o journal inteiro', () => {
    const plano = planejarReconciliacao({
      entradas: ENTRADAS,
      registradas: [],
      ate: null
    })
    expect(plano.inserir.map((e) => e.idx)).toEqual([0, 1, 2])
    expect(plano.jaRegistradas).toEqual([])
    expect(plano.migrateAplicaria).toEqual([])
  })

  test('é idempotente: o que já está registrado não entra de novo', () => {
    const plano = planejarReconciliacao({
      entradas: ENTRADAS,
      registradas: [{ hash: 'h0', created_at: 100 }],
      ate: null
    })
    expect(plano.inserir.map((e) => e.idx)).toEqual([1, 2])
    expect(plano.jaRegistradas.map((e) => e.idx)).toEqual([0])
  })

  /**
   * O caso que o WEB-70 descreve: o banco tem até a migration N, e as
   * posteriores precisam ser aplicadas de verdade pelo `migrate`, não
   * registradas como se já estivessem.
   */
  test('--upto para no corte e deixa o resto para o migrate', () => {
    const plano = planejarReconciliacao({
      entradas: ENTRADAS,
      registradas: [],
      ate: '0001_teste'
    })
    expect(plano.inserir.map((e) => e.idx)).toEqual([0, 1])
    expect(plano.migrateAplicaria.map((e) => e.idx)).toEqual([2])
  })

  test('tag inexistente falha em vez de registrar o journal todo', () => {
    expect(() =>
      planejarReconciliacao({
        entradas: ENTRADAS,
        registradas: [],
        ate: '9999_nao_existe'
      })
    ).toThrow(/não está no journal/)
  })

  /**
   * `migrate` compara só o maior `created_at`. Uma linha registrada mais nova
   * que o corte já esconde as migrations anteriores a ela, e o relatório tem
   * que refletir isso em vez de prometer que o `migrate` vai aplicá-las.
   */
  test('migrateAplicaria respeita o maior created_at já registrado', () => {
    const plano = planejarReconciliacao({
      entradas: ENTRADAS,
      registradas: [{ hash: 'desconhecido', created_at: 250 }],
      ate: '0000_teste'
    })
    expect(plano.migrateAplicaria.map((e) => e.idx)).toEqual([2])
  })

  test('linha sem arquivo correspondente é reportada, não apagada', () => {
    const plano = planejarReconciliacao({
      entradas: ENTRADAS,
      registradas: [{ hash: 'orfa', created_at: 50 }],
      ate: null
    })
    expect(plano.desconhecidas).toEqual([{ hash: 'orfa', created_at: 50 }])
  })
})

describe('lerJornal', () => {
  const pasta = path.join(import.meta.dir, '..', 'migrations')

  test('lê o journal real e casa cada entrada com seu arquivo', () => {
    const entradas = lerJornal(pasta)
    expect(entradas.length).toBeGreaterThan(0)
    for (const item of entradas) {
      expect(item.hash).toHaveLength(64)
      expect(item.quando).toBeGreaterThan(0)
    }
  })

  test('entradas vêm na ordem do journal, com `when` crescente', () => {
    const entradas = lerJornal(pasta)
    const quandos = entradas.map((item) => item.quando)
    expect([...quandos].sort((a, b) => a - b)).toEqual(quandos)
  })
})
