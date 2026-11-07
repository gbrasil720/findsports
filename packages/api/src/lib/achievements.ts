/**
 * Conquistas do torcedor (WEB-403, seção 09 do design). Decisão do dono em
 * 17/10/2026: "assistiu num bar" é código validado no balcão (o check-in por
 * localização entra com o WEB-408); as dez medalhas são as do design, e o
 * nível sobe pelo número de conquistas.
 *
 * Nada fica gravado: tudo sai das visitas e avaliações a cada leitura, então
 * desfazer uma validação tira a medalha junto. Só regra pura aqui; a leitura
 * do banco está em `achievements-read.ts`.
 */

export type AchievementGroup = 'bares' | 'bairros' | 'esportes' | 'resenhas'

export const ACHIEVEMENTS = [
  { id: 'bar1', group: 'bares', name: 'Primeira rodada', target: 1 },
  { id: 'bar5', group: 'bares', name: 'Desbravador', target: 5 },
  { id: 'bar10', group: 'bares', name: 'Rato de bar', target: 10 },
  { id: 'bai3', group: 'bairros', name: 'Rodou a cidade', target: 3 },
  { id: 'bai6', group: 'bairros', name: 'Cidadão', target: 6 },
  { id: 'esp2', group: 'esportes', name: 'Eclético', target: 2 },
  { id: 'esp4', group: 'esportes', name: 'Poliesportivo', target: 4 },
  { id: 'ava1', group: 'resenhas', name: 'Primeira resenha', target: 1 },
  { id: 'ava10', group: 'resenhas', name: 'Crítico', target: 10 },
  // Fora da grade do design (2i), que mostra nove; aparece na série do
  // detalhe ("Bares novos · 2 de 4") e entra por último na estante.
  { id: 'bar25', group: 'bares', name: 'Lenda do bairro', target: 25 }
] as const satisfies readonly {
  id: string
  group: AchievementGroup
  name: string
  target: number
}[]

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id']

/** Nível pelo número de conquistas; `from` é o mínimo para chegar nele. */
export const LEVELS = [
  { level: 1, name: 'Estreante', from: 0 },
  { level: 2, name: 'Torcedor', from: 1 },
  { level: 3, name: 'Boleiro', from: 3 },
  { level: 4, name: 'Frequentador', from: 5 },
  { level: 5, name: 'Camisa 10', from: 8 }
] as const

/** Um jogo visto num bar, com o código validado. */
export type Visit = {
  at: Date
  barId: string
  barName: string
  neighborhood: string
  city: string
  sportId: string
  sportName: string
}

export type Review = { at: Date; barName: string }

export type Achievement = {
  id: AchievementId
  group: AchievementGroup
  name: string
  target: number
  /** Quanto já tem na série (bares, bairros...), mesmo passado do alvo. */
  progress: number
  unlockedAt: Date | null
  /** O bar, bairro ou esporte que completou a medalha. */
  where: string | null
}

/**
 * Cada item novo de uma série (bar, bairro, esporte, avaliação) na ordem em
 * que apareceu. A medalha de alvo N fica com a data e o lugar do N-ésimo.
 */
function firsts(visits: Visit[], reviews: Review[]) {
  const sorted = [...visits].sort((a, b) => a.at.getTime() - b.at.getTime())
  const distinct = (key: (v: Visit) => string, where: (v: Visit) => string) => {
    const seen = new Set<string>()
    const out: { at: Date; where: string }[] = []
    for (const v of sorted) {
      const k = key(v)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ at: v.at, where: where(v) })
    }
    return out
  }
  return {
    bares: distinct(
      (v) => v.barId,
      (v) => v.barName
    ),
    // Bairro com o mesmo nome em outra cidade é outro bairro.
    bairros: distinct(
      (v) => `${v.city}\u0000${v.neighborhood}`,
      (v) => v.neighborhood
    ),
    esportes: distinct(
      (v) => v.sportId,
      (v) => `${v.sportName} · ${v.barName}`
    ),
    resenhas: [...reviews]
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((r) => ({ at: r.at, where: r.barName }))
  } satisfies Record<AchievementGroup, { at: Date; where: string }[]>
}

export function computeAchievements(
  visits: Visit[],
  reviews: Review[]
): Achievement[] {
  const series = firsts(visits, reviews)
  return ACHIEVEMENTS.map((a) => {
    const done = series[a.group][a.target - 1]
    return {
      ...a,
      progress: series[a.group].length,
      unlockedAt: done?.at ?? null,
      where: done?.where ?? null
    }
  })
}

export function levelFor(unlocked: number) {
  const index = LEVELS.reduce(
    (found, l, i) => (unlocked >= l.from ? i : found),
    0
  )
  const current = LEVELS[index] ?? LEVELS[0]
  const next = LEVELS[index + 1] ?? null
  return {
    level: current.level,
    name: current.name,
    unlocked,
    /** Conquistas para o próximo nível; nulo no último. */
    nextAt: next?.from ?? null
  }
}
