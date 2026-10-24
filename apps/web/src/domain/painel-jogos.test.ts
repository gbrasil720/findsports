import { describe, expect, test } from 'bun:test'
import {
  agruparPorDia,
  casaBusca,
  filtrarJogos,
  marcouHa,
  montarSemana,
  rotuloDia,
  rotuloSemana
} from './painel-jogos'

// Segunda, 12/10/2026, 15:00 em Brasília (18:00 UTC).
const NOW = new Date('2026-10-12T18:00:00Z')
const jogo = (startsAt: string, endsAt: string | null = null) => ({
  startsAt,
  endsAt,
  id: startsAt
})

describe('filtrarJogos', () => {
  const aoVivo = jogo('2026-10-12T17:30:00Z')
  const hojeANoite = jogo('2026-10-13T00:30:00Z')
  const amanha = jogo('2026-10-13T19:00:00Z')
  const ontem = jogo('2026-10-11T22:00:00Z')
  const semanaPassada = jogo('2026-10-05T22:00:00Z')
  const todos = [amanha, semanaPassada, hojeANoite, ontem, aoVivo]

  test('próximos: o ao vivo primeiro, depois por início', () => {
    expect(filtrarJogos(todos, 'proximos', NOW.getTime())).toEqual([
      aoVivo,
      hojeANoite,
      amanha
    ])
  })

  test('passados: o mais recente primeiro', () => {
    expect(filtrarJogos(todos, 'passados', NOW.getTime())).toEqual([
      ontem,
      semanaPassada
    ])
  })
})

test('busca sem acento nem caixa, palavra por palavra', () => {
  const textos = ['Grêmio × Internacional', 'Brasileirão', 'Futebol']
  expect(casaBusca('gremio', textos)).toBe(true)
  expect(casaBusca('INTER brasileirao', textos)).toBe(true)
  expect(casaBusca('gremio flamengo', textos)).toBe(false)
  expect(casaBusca('   ', textos)).toBe(true)
})

test('rótulo do dia: hoje, amanhã e ontem com a data; os outros pelo nome', () => {
  expect(rotuloDia('2026-10-12', NOW)).toBe('Hoje · seg, 12 out')
  expect(rotuloDia('2026-10-13', NOW)).toBe('Amanhã · ter, 13 out')
  expect(rotuloDia('2026-10-11', NOW)).toBe('Ontem · dom, 11 out')
  expect(rotuloDia('2026-10-14', NOW)).toBe('Quarta · 14 out')
  expect(rotuloDia('2026-10-17', NOW)).toBe('Sábado · 17 out')
  expect(rotuloDia('2027-01-04', NOW)).toBe('Segunda · 4 jan 2027')
})

test('agrupa por dia de Brasília, mantendo a ordem', () => {
  // 00:30 UTC do dia 13 ainda é 21:30 do dia 12 em Brasília.
  const noite = jogo('2026-10-13T00:30:00Z')
  const tarde = jogo('2026-10-12T19:00:00Z')
  const amanha = jogo('2026-10-13T19:00:00Z')
  const grupos = agruparPorDia([tarde, noite, amanha], NOW)
  expect(
    grupos.map((g) => [g.rotulo, g.hoje, g.jogos.map((j) => j.id)])
  ).toEqual([
    ['Hoje · seg, 12 out', true, [tarde.id, noite.id]],
    ['Amanhã · ter, 13 out', false, [amanha.id]]
  ])
})

describe('semana', () => {
  test('sete dias com os jogos de cada um, hoje e os que já passaram', () => {
    const noite = jogo('2026-10-13T00:30:00Z')
    const sabado = jogo('2026-10-17T19:00:00Z')
    const fora = jogo('2026-10-19T19:00:00Z')
    const dias = montarSemana('2026-10-12', [sabado, fora, noite], NOW)
    expect(dias.map((d) => `${d.numero} ${d.semana}`)).toEqual([
      '12 Seg',
      '13 Ter',
      '14 Qua',
      '15 Qui',
      '16 Sex',
      '17 Sáb',
      '18 Dom'
    ])
    expect(dias[0]?.hoje).toBe(true)
    expect(dias[0]?.jogos).toEqual([noite])
    expect(dias[5]?.jogos).toEqual([sabado])
    expect(dias.flatMap((d) => d.jogos)).not.toContain(fora)

    const anterior = montarSemana('2026-10-05', [], NOW)
    expect(anterior.every((d) => d.passado)).toBe(true)
  })

  test('rótulo da semana, com a virada de mês', () => {
    expect(rotuloSemana('2026-10-12', NOW)).toBe('12 a 18 out')
    expect(rotuloSemana('2026-10-26', NOW)).toBe('26 out a 1 nov')
    expect(rotuloSemana('2026-12-28', NOW)).toBe('28 dez a 3 jan 2027')
  })
})

test('marcou há minutos, horas ou dias', () => {
  const now = NOW.getTime()
  expect(marcouHa(new Date(now - 40 * 60_000), now)).toBe('Marcou há 40 min')
  expect(marcouHa(new Date(now - 2 * 3_600_000), now)).toBe('Marcou há 2 h')
  expect(marcouHa(new Date(now - 50 * 3_600_000), now)).toBe('Marcou há 2 dias')
})
