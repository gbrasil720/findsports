import { describe, expect, test } from 'bun:test'
import {
  chegadasDoDia,
  dataCurta,
  diaDaCasa,
  montarNoite,
  nomeDoDia,
  posicao,
  rotuloHora,
  semanaDe,
  somaDosJogos,
  validadosAte,
  vaoPorDia,
  variacao
} from './hoje-model'

// Brasília é UTC-3: 21:30 em Brasília é 00:30Z do dia seguinte.
const br = (dia: string, hm: string) => new Date(`${dia}T${hm}:00-03:00`)

describe('diaDaCasa', () => {
  test('a noite vai até as 6h do dia seguinte', () => {
    expect(diaDaCasa(br('2026-10-24', '23:00'))).toBe('2026-10-24')
    expect(diaDaCasa(br('2026-10-25', '01:30'))).toBe('2026-10-24')
    expect(diaDaCasa(br('2026-10-25', '06:00'))).toBe('2026-10-25')
  })
})

describe('datas', () => {
  test('topo da tela e semana de domingo a sábado', () => {
    expect(dataCurta('2026-10-12')).toBe('Seg, 12 out')
    expect(nomeDoDia('2026-10-24')).toBe('sábado')
    const semana = semanaDe('2026-10-24')
    expect(semana.map((d) => d.rotulo)).toEqual([
      'Dom',
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
      'Sáb'
    ])
    expect(semana[0]?.dia).toBe('2026-10-18')
    expect(semana[6]?.dia).toBe('2026-10-24')
    expect(semanaDe('2026-10-25')[0]?.dia).toBe('2026-10-25')
  })
})

describe('montarNoite', () => {
  const now = br('2026-10-12', '21:52').getTime()
  const jogo = (id: string, hm: string, dia = '2026-10-12', fim?: string) => ({
    id,
    startsAt: br(dia, hm),
    endsAt: fim ? br(dia, fim) : null
  })

  test('jogos da noite em faixas, estado e a linha do agora', () => {
    const noite = montarNoite(
      [
        jogo('real', '23:45'),
        jogo('cor', '21:30', '2026-10-12', '23:30'),
        jogo('lakers', '22:00'),
        jogo('ontem', '21:00', '2026-10-11'),
        jogo('amanha', '19:00', '2026-10-13')
      ],
      now
    )
    expect(noite.dia).toBe('2026-10-12')
    expect(noite.blocos.map((b) => b.jogo.id)).toEqual([
      'cor',
      'lakers',
      'real'
    ])
    expect(noite.blocos.map((b) => b.linha)).toEqual([0, 1, 0])
    expect(noite.blocos.map((b) => b.estado)).toEqual([
      'live',
      'upcoming',
      'upcoming'
    ])
    expect(noite.linhas).toBe(2)
    expect(noite.de).toBe(18)
    // Real Madrid às 23:45 sem fim informado vai até 2:45: a noite estica.
    expect(noite.ate).toBe(27)
    expect(noite.agora).toBeCloseTo(21 + 52 / 60)
  })

  test('jogo da tarde abre a noite mais cedo; jogo da madrugada entra', () => {
    const noite = montarNoite(
      [jogo('tarde', '16:00'), jogo('madrugada', '01:00', '2026-10-13')],
      now
    )
    expect(noite.de).toBe(16)
    expect(noite.blocos.map((b) => b.estado)).toEqual(['past', 'upcoming'])
    expect(noite.blocos.map((b) => b.inicio)).toEqual([16, 25])
  })

  test('sem jogo: 18h às 2h e nenhuma faixa', () => {
    const noite = montarNoite([], now)
    expect([noite.de, noite.ate, noite.linhas]).toEqual([18, 26, 0])
  })

  test('posição e rótulo das horas', () => {
    expect(posicao(18, 18, 26)).toBe(0)
    expect(posicao(22, 18, 26)).toBe(50)
    expect(posicao(40, 18, 26)).toBe(100)
    expect([rotuloHora(18), rotuloHora(24), rotuloHora(25)]).toEqual([
      '18h',
      '00h',
      '01h'
    ])
  })
})

describe('contagens', () => {
  const linha = (
    eventId: string,
    dia: string,
    reservedPeople: number | null,
    arrivals: number | null
  ) => ({ eventId, startsAt: br(dia, '21:00'), reservedPeople, arrivals })

  test('soma de quem vai e de quem chegou nos jogos de hoje', () => {
    const linhas = [
      linha('a', '2026-10-12', 24, 9),
      linha('b', '2026-10-12', 5, 0),
      linha('c', '2026-10-13', 3, 0)
    ]
    expect(somaDosJogos(linhas, new Set(['a', 'b']))).toEqual({
      vao: 29,
      chegaram: 9
    })
    expect(somaDosJogos(linhas, new Set())).toEqual({ vao: 0, chegaram: 0 })
  })

  test('plano sem a lista: nada de zero', () => {
    expect(
      somaDosJogos([linha('a', '2026-10-12', null, null)], new Set(['a']))
    ).toBeNull()
  })

  test('por dia, validados até hoje e variação', () => {
    const linhas = [
      linha('a', '2026-10-12', 24, 9),
      linha('b', '2026-10-12', 5, 1),
      linha('c', '2026-10-14', 3, 2)
    ]
    expect(
      vaoPorDia(linhas, ['2026-10-12', '2026-10-13', '2026-10-14'])
    ).toEqual([29, 0, 3])
    expect(validadosAte(linhas, '2026-10-13')).toBe(10)
    expect(variacao(64, 59)).toBe(8)
    expect(variacao(5, 10)).toBe(-50)
    expect(variacao(3, 0)).toBeNull()
    expect(variacao(0, 0)).toBe(0)
  })
})

describe('chegadasDoDia', () => {
  test('só quem validou hoje, do mais recente ao mais antigo', () => {
    const jogos = [
      {
        id: 'a',
        people: [
          { name: 'Pedro', validatedAt: br('2026-10-12', '20:30') },
          { name: 'Marina', validatedAt: br('2026-10-12', '21:12') },
          { name: 'Rafa', validatedAt: null }
        ]
      },
      {
        id: 'b',
        people: [{ name: 'Ontem', validatedAt: br('2026-10-11', '22:00') }]
      }
    ]
    expect(
      chegadasDoDia(jogos, '2026-10-12').map((c) => [c.nome, c.jogo.id])
    ).toEqual([
      ['Marina', 'a'],
      ['Pedro', 'a']
    ])
  })
})
