import type { ProfileEvent } from './pub-profile'

/**
 * Fatos sobre o bar que a plataforma sabe sem o bar digitar nada.
 *
 * Existem por um motivo específico: a seção de características não pode
 * depender só do que o dono preencheu. Um bar que marcou pouco produzia um
 * painel com uma linha dentro de uma caixa grande — o problema que motivou
 * este módulo. O que a Onside já observa (quais esportes ele transmite, com
 * que frequência, há quanto tempo está na plataforma) preenche o resto sem
 * pedir nada a ninguém.
 *
 * Tudo aqui é derivado do que `pubs.getById` já devolve. Nenhuma query nova.
 *
 * O tipo é uma lista de `Fact` de propósito, e a nota do bar entrou por aí:
 * é só mais um produtor de `Fact`, sem mexer no layout.
 */
export type Fact = {
  key: string
  label: string
  value: string
}

const MS_PER_DAY = 86_400_000

const MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
]

/** Quantos campeonatos cabem na linha antes de virar sopa. */
const MAX_CHAMPIONSHIPS = 2

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/**
 * Campeonatos que o bar costuma passar.
 *
 * `event.championship` é texto livre — o bar digita o que quiser. Então a
 * deduplicação é por texto normalizado, mas o que aparece na tela é a grafia
 * original do bar: corrigir "brasileirao" para "Brasileirão" exigiria um
 * vocabulário fechado de campeonatos, que é outro projeto.
 */
function recurringChampionships(events: ProfileEvent[]): string[] {
  const counts = new Map<string, { label: string; count: number }>()

  for (const event of events) {
    const label = event.championship.trim()
    if (!label) continue

    const key = label.toLowerCase()
    const current = counts.get(key)
    if (current) {
      current.count += 1
    } else {
      counts.set(key, { label, count: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_CHAMPIONSHIPS)
    .map((item) => item.label)
}

function distinctSports(events: ProfileEvent[]): string[] {
  const seen = new Map<string, string>()

  for (const event of events) {
    const name = event.sport.name.trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.set(name.toLowerCase(), name)
    }
  }

  return [...seen.values()]
}

function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]}/${date.getFullYear()}`
}

export function buildBarFacts(input: {
  events: ProfileEvent[]
  createdAt: string | Date | null
  /**
   * Já filtrada pelo servidor: vem `null` quando o bar não atingiu o piso
   * público ou quando a exibição está desligada. A tela não decide isso.
   */
  rating: { positive: number; total: number; percentage: number } | null
  now?: Date | number
}): Fact[] {
  const now = input.now ?? Date.now()
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const facts: Fact[] = []

  // Primeiro fato da lista quando existe: é a única linha do painel que vem
  // de outros torcedores, e não do próprio bar.
  if (input.rating) {
    facts.push({
      key: 'rating',
      label: 'Voltariam pra ver jogo',
      value: `${input.rating.percentage}% de ${input.rating.total}`
    })
  }

  const sports = distinctSports(input.events)
  if (sports.length > 0) {
    facts.push({
      key: 'sports',
      label: 'Transmite',
      value: joinNames(sports)
    })
  }

  const championships = recurringChampionships(input.events)
  if (championships.length > 0) {
    facts.push({
      key: 'championships',
      label: 'Costuma passar',
      value: joinNames(championships)
    })
  }

  const withinWeek = input.events.filter((event) => {
    const delta = event.startsAt.getTime() - nowMs
    return delta >= -MS_PER_DAY && delta <= 7 * MS_PER_DAY
  }).length

  if (withinWeek > 0) {
    facts.push({
      key: 'week',
      label: 'Próximos 7 dias',
      value: withinWeek === 1 ? '1 jogo' : `${withinWeek} jogos`
    })
  }

  if (input.createdAt) {
    const since =
      typeof input.createdAt === 'string'
        ? new Date(input.createdAt)
        : input.createdAt

    if (!Number.isNaN(since.getTime())) {
      facts.push({
        key: 'since',
        label: 'Na Onside desde',
        value: formatMonthYear(since)
      })
    }
  }

  return facts
}
