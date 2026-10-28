import { describe, expect, test } from 'bun:test'

import {
  brasiliaWeek,
  createEmptyScheduleEmail,
  createGameFillingEmail,
  createWeeklySummaryEmail,
  statNumber,
  weeklyNoticeFor
} from './bar-notices'

const at = (iso: string) => new Date(iso)

describe('brasiliaWeek', () => {
  test('segunda 01:00 de Brasília é o começo da semana', () => {
    // 04:00 UTC = 01:00 em Brasília: a hora do cron.
    const week = brasiliaWeek(at('2026-10-26T04:00:00Z'))
    expect(week.monday).toBe('2026-10-26')
    expect(week.isMonday).toBe(true)
    expect(week.start.toISOString()).toBe('2026-10-26T03:00:00.000Z')
    expect(week.end.toISOString()).toBe('2026-11-02T03:00:00.000Z')
    expect(week.previousStart.toISOString()).toBe('2026-10-19T03:00:00.000Z')
  })

  test('domingo 23:30 em Brasília ainda é a semana que começou na segunda anterior', () => {
    const week = brasiliaWeek(at('2026-11-02T02:30:00Z'))
    expect(week.monday).toBe('2026-10-26')
    expect(week.isMonday).toBe(false)
  })

  test('segunda 02:00 UTC ainda é domingo em Brasília', () => {
    expect(brasiliaWeek(at('2026-10-26T02:00:00Z')).isMonday).toBe(false)
  })
})

describe('weeklyNoticeFor', () => {
  test('resumo ligado: vai o resumo, com ou sem jogo na semana', () => {
    for (const emptySchedule of [true, false]) {
      for (const games of [0, 3]) {
        expect(
          weeklyNoticeFor({ weeklySummary: true, emptySchedule, games })
        ).toBe('weekly_summary')
      }
    }
  })

  test('só a grade vazia ligada: avisa só a semana sem jogo', () => {
    expect(
      weeklyNoticeFor({ weeklySummary: false, emptySchedule: true, games: 0 })
    ).toBe('empty_schedule')
    expect(
      weeklyNoticeFor({ weeklySummary: false, emptySchedule: true, games: 1 })
    ).toBeNull()
  })

  test('tudo desligado: nada', () => {
    expect(
      weeklyNoticeFor({ weeklySummary: false, emptySchedule: false, games: 0 })
    ).toBeNull()
  })
})

const previous = {
  start: at('2026-10-19T03:00:00Z'),
  end: at('2026-10-26T03:00:00Z')
}
const current = {
  start: at('2026-10-26T03:00:00Z'),
  end: at('2026-11-02T03:00:00Z')
}
const game = (n: number, iso: string) => ({
  id: `jogo-${n}`,
  title: `Time ${n} × Rival ${n}`,
  startsAt: at(iso)
})

describe('resumo da semana', () => {
  const base = {
    owner: 'Zé Carvalho',
    barName: 'Bar do Zé',
    previous,
    current,
    numbers: { going: 34, validatedCodes: 1, profileViews: 210 },
    games: [game(1, '2026-10-29T00:30:00Z')]
  }

  test('Elite vê presenças e códigos; o texto e o HTML dizem o mesmo', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: true })
    expect(email.subject).toBe('Resumo da semana: Bar do Zé')
    expect(email.text).toContain(
      'Olá, Zé Carvalho. Veja como foi a semana de 19/10 a 25/10 na Onside'
    )
    expect(email.text).toContain('BAR DO ZÉ · DE 19/10 A 25/10')
    expect(email.text).toContain(
      '34 pessoas marcaram que iam aos seus jogos\n1 código validado no balcão\n210 vezes que o perfil do bar foi aberto'
    )
    expect(email.text).toContain(
      'NESTA SEMANA · DE 26/10 A 01/11\nQUA 28/10 · Time 1 × Rival 1 · 21:30'
    )
    expect(email.text).toContain('Abrir o painel:\nhttp')
    expect(email.html).toContain('código validado no balcão')
    expect(email.html).toContain('/admin/configuracoes#avisos')
  })

  test('fora do Elite, sem presenças nem códigos', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: false })
    expect(email.text).not.toContain('marcaram')
    expect(email.text).not.toContain('código')
    expect(email.text).toContain('210 vezes que o perfil do bar foi aberto')
  })

  test('semana vazia leva a cadastrar jogos', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: true, games: [] })
    expect(email.text).toContain(
      'Nenhum jogo na agenda desta semana, de 26/10 a 01/11.'
    )
    expect(email.text).toMatch(
      /Cadastrar jogos:\nhttps?:\/\/\S+\/admin\/jogos\?novo=1/
    )
  })

  test('mais de quatro jogos: quatro por extenso e o resto contado', () => {
    const games = [1, 2, 3, 4, 5, 6].map((n) =>
      game(n, `2026-10-2${7 + (n % 3)}T22:00:00Z`)
    )
    const email = createWeeklySummaryEmail({ ...base, elite: true, games })
    expect(email.text).toContain('Time 4 × Rival 4')
    expect(email.text).not.toContain('Time 5 × Rival 5')
    expect(email.text).toContain('\ne mais 2 outros jogos.')
  })

  test('nome e título com HTML saem escapados', () => {
    const email = createWeeklySummaryEmail({
      ...base,
      elite: false,
      owner: '<b>Zé</b>',
      games: [{ ...game(1, '2026-10-29T00:30:00Z'), title: 'A <script> B' }]
    })
    expect(email.html).not.toContain('<b>Zé</b>')
    expect(email.html).not.toContain('<script>')
  })
})

test('o campeonato vai no detalhe do jogo, e não repete quando é o título', () => {
  const email = createWeeklySummaryEmail({
    owner: 'Zé',
    barName: 'Bar',
    previous,
    current,
    numbers: { going: 1, validatedCodes: 0, profileViews: 1 },
    elite: true,
    games: [
      { ...game(1, '2026-10-29T00:30:00Z'), championship: 'Brasileirão' },
      {
        ...game(2, '2026-10-31T20:00:00Z'),
        title: 'Libertadores',
        championship: 'Libertadores'
      }
    ]
  })
  expect(email.text).toContain(
    'QUA 28/10 · Time 1 × Rival 1 · 21:30 · Brasileirão'
  )
  expect(email.text).toContain('SÁB 31/10 · Libertadores · 17:00\n')
  // Singular e número grande.
  expect(email.text).toContain('1 pessoa marcou que ia aos seus jogos')
  expect(email.text).toContain('1 vez que o perfil do bar foi aberto')
})

test('número grande vira "mil" ou "mi", com espaço que quebra', () => {
  expect(statNumber(1204)).toBe('1.204')
  expect(statNumber(9999)).toBe('9.999')
  expect(statNumber(12_345)).toBe('12 mil')
  expect(statNumber(1_234_567)).toBe('1,2 mi')
})

test('semana vazia: os sete dias de segunda a domingo', () => {
  const { text, html } = createEmptyScheduleEmail({ owner: 'Zé', current })
  for (const day of ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
    expect(html).toContain(`>${day}</div>`)
  expect(html).toContain('>26</div>')
  expect(html).toContain('>01</div>')
  expect(text).toContain('1. Com jogo na agenda')
})

test('grade vazia', () => {
  const email = createEmptyScheduleEmail({ owner: '', current })
  expect(email.subject).toBe('Nenhum jogo na agenda desta semana')
  expect(email.text).toContain(
    'Olá. Seu bar não tem nenhum jogo na agenda desta semana, de 26/10 a 01/11.'
  )
  expect(email.text).toMatch(
    /Cadastrar jogos:\nhttps?:\/\/\S+\/admin\/jogos\?novo=1/
  )
})

test('jogo lotando', () => {
  const email = createGameFillingEmail({
    owner: 'Zé',
    game: game(7, '2026-10-29T00:30:00Z')
  })
  expect(email.subject).toBe('Jogo lotando: Time 7 × Rival 7')
  expect(email.text).toContain(
    'Olá, Zé. Mais de 20 pessoas marcaram na Onside que vão assistir a Time 7 × Rival 7 no seu bar, qua., 28/10, 21:30.'
  )
  expect(email.text).toMatch(/\/admin\/jogos\?jogo=jogo-7/)
  expect(email.text).toContain('Avisamos uma vez por jogo.')
  expect(email.text).toContain(
    'NO SEU BAR\nTime 7 × Rival 7\nQUA., 28/10, 21:30\n20+ pessoas marcaram que vão assistir aqui'
  )
  expect(
    createGameFillingEmail({
      owner: 'Zé',
      game: { ...game(7, '2026-10-29T00:30:00Z'), championship: 'Brasileirão' }
    }).text
  ).toContain('BRASILEIRÃO · NO SEU BAR')
})
