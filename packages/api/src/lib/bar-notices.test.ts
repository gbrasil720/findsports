import { describe, expect, test } from 'bun:test'

import {
  brasiliaWeek,
  createEmptyScheduleEmail,
  createGameFillingEmail,
  createPixTrialEndEmail,
  createWeeklySummaryEmail,
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
  championship: 'Brasileirão',
  startsAt: at(iso)
})

/** O texto que aparece no HTML, sem marcação. */
const visible = (html: string) =>
  html
    .slice(html.indexOf('<body'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/\s+/g, ' ')

describe('resumo da semana', () => {
  const base = {
    owner: 'Zé Carvalho',
    barName: 'Bar do Zé',
    previous,
    current,
    numbers: { going: 34, validatedCodes: 1, profileViews: 1204 },
    games: [game(1, '2026-10-29T00:30:00Z')]
  }

  test('Elite vê o placar com presenças, códigos e perfil; o texto e o HTML dizem o mesmo', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: true })
    expect(email.subject).toBe('Resumo da semana: Bar do Zé')
    expect(email.text).toContain(
      'Olá, Zé Carvalho. Veja como foi a semana de 19/10 a 25/10 no Bar do Zé, na Onside'
    )
    expect(email.text).toContain(
      'Bar do Zé · de 19/10 a 25/10\n34 pessoas marcaram que iam aos seus jogos\n1 código validado no balcão\n1.204 vezes que o perfil do bar foi aberto'
    )
    expect(email.text).toContain('Abrir o painel:\nhttp')
    const html = visible(email.html)
    expect(html).toContain('PAINEL DO BAR')
    expect(html).toContain('1 código validado no balcão')
    expect(html).toContain('1.204 vezes que o perfil do bar foi aberto')
    expect(html).toContain('Desligar em Configurações › Avisos')
    expect(email.html).toContain('/admin/configuracoes#cfg-av')
  })

  test('fora do Elite, o placar tem um número só: o perfil aberto', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: false })
    expect(email.text).not.toContain('marcaram')
    expect(email.text).not.toContain('código')
    expect(email.text).toContain('1.204 vezes que o perfil do bar foi aberto')
    // Um número ocupa a linha: sem colunas de largura fixa.
    expect(email.html).not.toContain('width="33%"')
    expect(email.html).toContain('font-size:40px')
  })

  test('agenda: "Na sua agenda", com a caixa do dia e o campeonato na linha do jogo', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: true })
    expect(email.text).toContain(
      'Na sua agenda · de 26/10 a 01/11\n• QUA 28/10 · Time 1 × Rival 1 · 21:30 · BRASILEIRÃO'
    )
    // A faixa usa o título do jogo, não siglas.
    expect(visible(email.html)).toContain('QUA 28 Time 1 × Rival 1 21:30')
  })

  test('semana vazia: a semana em branco e o convite a cadastrar jogos', () => {
    const email = createWeeklySummaryEmail({ ...base, elite: true, games: [] })
    expect(email.text).toContain(
      'Nenhum jogo na agenda desta semana, de 26/10 a 01/11.'
    )
    expect(email.text).toMatch(
      /Cadastrar jogos:\nhttps?:\/\/\S+\/admin\/jogos$/m
    )
    expect(visible(email.html)).toContain('SEG 26 — · TER 27 —')
  })

  test('mais de quatro jogos: quatro na agenda e o resto contado', () => {
    const games = [1, 2, 3, 4, 5, 6].map((n) =>
      game(n, `2026-10-2${7 + (n % 3)}T22:00:00Z`)
    )
    const email = createWeeklySummaryEmail({ ...base, elite: true, games })
    expect(email.text).toContain('Time 4 × Rival 4')
    expect(email.text).not.toContain('Time 5 × Rival 5')
    expect(email.text).toContain('e mais 2 outros jogos.')
  })

  test('nome e título com HTML saem escapados', () => {
    const email = createWeeklySummaryEmail({
      ...base,
      elite: false,
      owner: '<b>Zé</b>',
      barName: '<i>Bar</i>',
      games: [{ ...game(1, '2026-10-29T00:30:00Z'), title: 'A <script> B' }]
    })
    expect(email.html).not.toContain('<b>Zé</b>')
    expect(email.html).not.toContain('<i>Bar</i>')
    expect(email.html).not.toContain('<script>')
  })
})

test('grade vazia', () => {
  const email = createEmptyScheduleEmail({ owner: '', current })
  expect(email.subject).toBe('Nenhum jogo na agenda desta semana')
  expect(email.text).toContain(
    'Olá. Seu bar não tem nenhum jogo na agenda desta semana, de 26/10 a 01/11.'
  )
  expect(email.text).toMatch(/Cadastrar jogos:\nhttps?:\/\/\S+\/admin\/jogos$/m)
  // A semana em branco, dia a dia, de segunda a domingo.
  const html = visible(email.html)
  expect(html).toContain('SEG 26 —')
  expect(html).toContain('DOM 01 —')
  expect(email.html).toContain('Desligar em Configurações › Avisos')
})

test('jogo lotando', () => {
  const email = createGameFillingEmail({
    owner: 'Zé',
    barName: 'Bar do Zé',
    game: game(7, '2026-10-29T00:30:00Z')
  })
  expect(email.subject).toBe('Jogo lotando: Time 7 × Rival 7')
  expect(email.text).toContain(
    'Olá, Zé. Mais de 20 pessoas marcaram na Onside que vão assistir a Time 7 × Rival 7 no seu bar, qua., 28/10, 21:30.'
  )
  // O ingresso: campeonato, título, quando e "20+", nunca o número exato.
  expect(email.text).toContain(
    'BRASILEIRÃO · NO SEU BAR\nTime 7 × Rival 7\nQUA 28/10 · 21:30\n20+ pessoas marcaram que vão assistir aqui'
  )
  expect(visible(email.html)).toContain('Bar do Zé · qua., 28/10, 21:30')
  expect(email.text).toMatch(/\/admin\/jogos\?jogo=jogo-7/)
  expect(email.text).toContain('Avisamos uma vez por jogo.')
})

describe('jogos da semana no resumo (WEB-433)', () => {
  const sugestao = (n: number, extra = {}) => ({
    key: `k${n}`,
    title: `Casa ${n} × Fora ${n}`,
    sportId: 'futebol',
    championship: 'Brasileirão',
    startsAt: '2026-10-31T21:00:00Z',
    participantIds: [],
    participantFreeText: null,
    channels: ['Premiere'],
    channelConfirmed: true,
    fansInCity: 1240,
    barsInNeighborhood: 0,
    reason: 'Seria o único do bairro',
    featured: n === 1,
    catalogId: `w${n}`,
    ...extra
  })
  const base = {
    owner: 'Zé',
    barName: 'Bar do Zé',
    previous,
    current,
    numbers: { going: 0, validatedCodes: 0, profileViews: 3 },
    elite: false,
    games: [],
    neighborhood: 'Consolação'
  }

  test('o card, três linhas e quantos ficam no painel, cada um com o link de publicar', () => {
    const email = createWeeklySummaryEmail({
      ...base,
      suggestions: [1, 2, 3, 4, 5, 6].map((n) =>
        sugestao(n, n === 1 ? { houseTeam: 'Palmeiras' } : {})
      )
    })
    const html = visible(email.html)
    expect(html).toContain('Casa 1 × Fora 1')
    expect(html).toContain('SEU TIME')
    expect(html).toContain('1.240')
    expect(html).toContain('bares de Consolação passam')
    expect(html).toContain('Publicar com telão e som →')
    expect(html).toContain('+ 2 no painel.')
    expect(email.html).toContain('/admin/jogos?publicar=w1')
    expect(email.text).toContain('/admin/jogos?publicar=w4')
  })

  test('sem o catálogo, o resumo sai como antes', () => {
    const email = createWeeklySummaryEmail({
      ...base,
      suggestions: [sugestao(1, { featured: undefined, catalogId: undefined })]
    })
    expect(email.text).not.toContain('o jogo que a Onside separou')
  })
})

describe('lembrete do Pix escolhido no teste', () => {
  const base = {
    owner: 'Ana',
    barName: 'Bar do Zé',
    plan: 'pro',
    trialEnd: new Date('2026-12-02T15:00:00Z'),
    lastDay: false
  }

  test('mensal: débito todo mês', () => {
    const email = createPixTrialEndEmail(base)
    expect(email.text).toContain('pagar o Pro com Pix')
    expect(email.text).toContain('depois todo mês na mesma data')
  })

  test('anual (Pix anual): o plano anual e o débito todo ano', () => {
    const email = createPixTrialEndEmail({ ...base, annual: true })
    expect(email.text).toContain('pagar o Pro anual com Pix')
    expect(email.text).toContain('depois todo ano na mesma data')
  })
})
