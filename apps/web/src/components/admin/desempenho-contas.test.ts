import { describe, expect, test } from 'bun:test'
import {
  codigosDoPeriodo,
  diaDoJogo,
  erroDoPersonalizado,
  jogosPorPublico,
  melhorJogo,
  rotuloPeriodo
} from './desempenho-contas'
import {
  numerosDoDesempenho,
  serieDiaria,
  variacaoPct,
  variacaoPp
} from './desempenho-dados'

const HOJE = '2026-10-24'

describe('período do Desempenho', () => {
  test('rótulo das datas, como no topo da página', () => {
    expect(rotuloPeriodo({ from: '2026-09-15', to: '2026-10-14' })).toBe(
      '15 set 2026 — 14 out 2026'
    )
  })

  test('personalizado: as duas datas, em ordem, até hoje e no histórico do plano', () => {
    const ok = { from: '2026-09-25', to: HOJE }
    expect(erroDoPersonalizado(ok, 30, HOJE)).toBeNull()
    expect(erroDoPersonalizado({ from: '', to: HOJE }, 30, HOJE)).toBe(
      'Informe as duas datas do período.'
    )
    expect(
      erroDoPersonalizado({ from: HOJE, to: '2026-10-01' }, null, HOJE)
    ).toBe('A data inicial deve ser anterior ou igual à data final.')
    expect(
      erroDoPersonalizado({ from: '2026-10-01', to: '2026-10-25' }, null, HOJE)
    ).toBe('O período termina hoje, no máximo.')
    // 31 dias no Starter (30): o servidor recusaria.
    expect(
      erroDoPersonalizado({ from: '2026-09-24', to: HOJE }, 30, HOJE)
    ).toBe('Seu plano permite até 30 dias.')
    expect(
      erroDoPersonalizado({ from: '2020-01-01', to: HOJE }, null, HOJE)
    ).toBeNull()
  })
})

describe('jogos do período', () => {
  const NOW = Date.parse('2026-10-24T21:00:00Z')
  const jogo = (
    id: string,
    startsAt: string,
    uniqueVisitors: number,
    interestedPeople: number | null
  ) => ({ id, startsAt, uniqueVisitors, interestedPeople })

  test('do que mais puxou público ao que menos, só os que já começaram', () => {
    const jogos = [
      jogo('a', '2026-10-12T23:00:00Z', 512, 64),
      jogo('b', '2026-10-11T23:00:00Z', 448, 52),
      jogo('c', '2026-10-08T23:00:00Z', 600, 52),
      jogo('hoje-mais-tarde', '2026-10-24T23:30:00Z', 0, 0)
    ]
    expect(jogosPorPublico(jogos, NOW).map((j) => j.id)).toEqual([
      'a',
      'c',
      'b'
    ])
    expect(melhorJogo(jogosPorPublico(jogos, NOW))?.id).toBe('a')
  })

  test('sem interessados no plano (Starter), ordena por quem viu e não há melhor jogo', () => {
    const jogos = [
      jogo('a', '2026-10-12T23:00:00Z', 100, null),
      jogo('b', '2026-10-11T23:00:00Z', 300, null)
    ]
    const ordenados = jogosPorPublico(jogos, NOW)
    expect(ordenados.map((j) => j.id)).toEqual(['b', 'a'])
    expect(melhorJogo(ordenados)).toBeUndefined()
    expect(
      melhorJogo([jogo('z', '2026-10-12T23:00:00Z', 5, 0)])
    ).toBeUndefined()
  })

  test('dia do jogo em Brasília', () => {
    // 01:30Z do dia 13 ainda é dia 12 em Brasília.
    expect(diaDoJogo('2026-10-13T01:30:00Z')).toBe('12 out')
  })

  test('códigos gerados e validados somam os jogos; fora do Elite, nada', () => {
    expect(
      codigosDoPeriodo([
        { reservedPeople: 24, arrivals: 9 },
        { reservedPeople: 31, arrivals: 22 }
      ])
    ).toEqual({ gerados: 55, validados: 31 })
    expect(codigosDoPeriodo([])).toEqual({ gerados: 0, validados: 0 })
    expect(
      codigosDoPeriodo([{ reservedPeople: null, arrivals: null }])
    ).toBeNull()
  })
})

describe('números e série do Desempenho', () => {
  test('variação em % e taxa em pontos percentuais', () => {
    expect(variacaoPct(18)).toBe('+18%')
    expect(variacaoPct(-4)).toBe('-4%')
    expect(variacaoPct(0)).toBe('0%')
    expect(variacaoPct(5900)).toBe('+5.900%')
    expect(variacaoPct(null)).toBeNull()
    expect(variacaoPp(0.134, 0.122)).toBe('+1,2 p.p.')
    expect(variacaoPp(0.1, 0.1)).toBe('0 p.p.')
    expect(variacaoPp(0.1, null)).toBeNull()
  })

  const base = {
    uniqueVisitors: 2140,
    profileViews: 3972,
    interestedPeople: 286,
    uniqueVisitorsChange: 18,
    interestedPeopleChange: 12,
    uniqueVisitorsPrev: 1813,
    interestedPeoplePrev: 220,
    dailyProfileViews: [
      { date: '2026-10-10', value: 120 },
      { date: '2026-10-11', value: 205 }
    ],
    dailyHighIntentActions: [
      { date: '2026-10-10', value: 4 },
      { date: '2026-10-11', value: 24 }
    ]
  }
  type Overview = Parameters<typeof numerosDoDesempenho>[0]

  test('os três números com apoio e variação', () => {
    const [viram, interesse, taxa] = numerosDoDesempenho(
      base as unknown as Overview
    )
    expect(viram?.valor).toBe('2.140')
    expect(viram?.apoio).toBe('abriram 3.972 vezes no total')
    expect(viram?.variacao).toBe('+18%')
    expect(interesse?.valor).toBe('286')
    expect(taxa?.valor).toBe('13,4%')
    expect(taxa?.variacao).toBe('+1,2 p.p.')
  })

  test('série diária: aberturas e contatos somados do mesmo dia', () => {
    expect(serieDiaria(base as unknown as Overview)).toEqual([
      { date: '2026-10-10', views: 120, actions: 4 },
      { date: '2026-10-11', views: 205, actions: 24 }
    ])
  })
})
