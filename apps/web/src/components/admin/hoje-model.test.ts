import { describe, expect, test } from 'bun:test'
import {
  chegadasDoDia,
  dataCurta,
  diaDaCasa,
  jogoDaOferta,
  montarNoite,
  nomeDoDia,
  posicao,
  rotuloHora,
  semanaDe,
  somaDosJogos,
  vezNoBar
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
    // Arrastando, a noite de amanhã: o jogo das 19h do dia 13.
    expect(noite.amanha.dia).toBe('2026-10-13')
    expect(noite.amanha.blocos.map((b) => [b.jogo.id, b.inicio])).toEqual([
      ['amanha', 19]
    ])
    expect(noite.amanha.agora).toBeNull()
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
    // Amanhã, depois das 8 colunas de hoje, numa linha de 16.
    expect(posicao(18, 18, 26, 8, 16)).toBe(50)
    expect(posicao(22, 18, 26, 8, 16)).toBe(75)
    expect([rotuloHora(18), rotuloHora(24), rotuloHora(25)]).toEqual([
      '18h',
      '00h',
      '01h'
    ])
  })
})

describe('jogoDaOferta', () => {
  const jogo = (
    id: string,
    hm: string,
    fim?: string,
    publicado: boolean = true
  ) => ({
    id,
    startsAt: br('2026-10-12', hm),
    endsAt: fim ? br('2026-10-12', fim) : null,
    publishedAt: publicado ? br('2026-10-01', '12:00') : null
  })
  const ids = (
    hm: string,
    jogos: ReturnType<typeof jogo>[],
    dia = '2026-10-12'
  ) =>
    jogoDaOferta(montarNoite(jogos, br(dia, hm).getTime()).blocos)?.id ?? null

  test('o ao vivo, senão o próximo, senão o último que acabou', () => {
    const noite = [
      jogo('tarde', '16:00', '18:00'),
      jogo('cor', '21:30', '23:30'),
      jogo('real', '23:45')
    ]
    expect(ids('22:00', noite)).toBe('cor')
    expect(ids('19:00', noite)).toBe('cor')
    expect(ids('15:00', noite)).toBe('tarde')
    // Às 3h da madrugada ainda é a noite do dia 12, e tudo já acabou.
    expect(ids('03:00', noite, '2026-10-13')).toBe('real')
  })

  test('rascunho fica de fora; sem jogo publicado, nenhum', () => {
    expect(
      ids('19:00', [
        jogo('rascunho', '20:00', undefined, false),
        jogo('pub', '22:00')
      ])
    ).toBe('pub')
    expect(ids('19:00', [jogo('rascunho', '20:00', undefined, false)])).toBe(
      null
    )
    expect(ids('19:00', [])).toBe(null)
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
})

describe('chegadasDoDia', () => {
  test('só quem validou hoje, do mais recente ao mais antigo', () => {
    const visita = { offer: true, firstVisit: true, visitsThisMonth: 1 }
    const jogos = [
      {
        id: 'a',
        people: [
          {
            name: 'Pedro',
            validatedAt: br('2026-10-12', '20:30'),
            arrival: visita
          },
          {
            name: 'Marina',
            validatedAt: br('2026-10-12', '21:12'),
            arrival: visita
          },
          { name: 'Rafa', validatedAt: null, arrival: null }
        ]
      },
      {
        id: 'b',
        people: [
          {
            name: 'Ontem',
            validatedAt: br('2026-10-11', '22:00'),
            arrival: visita
          }
        ]
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

describe('vezNoBar', () => {
  test('primeira visita a este bar, senão a conta do mês', () => {
    const v = { offer: false, visitsThisMonth: 1 }
    expect(vezNoBar({ ...v, firstVisit: true })).toBe('primeira vez no bar')
    // Já veio em outro mês: a primeira deste mês não é a primeira no bar.
    expect(vezNoBar({ ...v, firstVisit: false })).toBe('1ª vez no mês')
    expect(vezNoBar({ ...v, firstVisit: false, visitsThisMonth: 4 })).toBe(
      '4ª vez no mês'
    )
  })
})
