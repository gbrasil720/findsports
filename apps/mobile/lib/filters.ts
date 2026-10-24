import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { brasiliaDay } from '@findsports_oficial/db/event-window'

/*
 * Filtros do Explorar (19d do design) e os atalhos no topo do mapa (19e).
 * Contas puras; o estado mora em `components/explore-state.tsx`.
 */

const DAY = 86_400_000

/** O que a busca recebe além do centro. `null` é "qualquer". */
export type Filters = {
  /** Dia de Brasília, "2026-10-20". */
  date: string | null
  sportId: string | null
  amenities: number[]
  /** `null` usa o raio do perfil. */
  radius: number | null
  /**
   * "Só bares com jogo publicado" (19d): tira da lista e do mapa os bares sem
   * jogo que completam o Explorar quando há poucos com jogo.
   */
  gamesOnly: boolean
}

export const NO_FILTERS: Filters = {
  date: null,
  sportId: null,
  amenities: [],
  radius: null,
  gamesOnly: false
}

/** Quantos bares a busca do Explorar traz: os do mapa e o "Ver N bares". */
export const SEARCH_LIMIT = 30

/** O raio da busca: o do filtro, senão o do perfil, até o teto. */
export const searchRadius = (f: Filters, profileKm: number) =>
  Math.min(f.radius ?? profileKm, SEARCH_RADIUS_MAX_KM)

/**
 * A entrada de `pubs.search` para os filtros: a mesma no Explorar e no
 * "Ver N bares" da folha de filtros, para o número do botão ser o que o mapa
 * mostra.
 */
export const searchInput = (
  f: Filters,
  center: { lat: number; lng: number },
  radiusKm: number
) => ({
  ...center,
  radiusKm,
  date: f.date ?? undefined,
  sportId: f.sportId ?? undefined,
  amenities: f.amenities.length ? f.amenities : undefined,
  limit: SEARCH_LIMIT
})

/** "2026-10-20": o dia de Brasília de `now` mais `plus` dias. */
export const dayKey = (now: number, plus = 0) => brasiliaDay(now, plus)

/** Quantos filtros estão ligados: o número do botão e do "Limpar". */
export const activeCount = (f: Filters) =>
  (f.date ? 1 : 0) +
  (f.sportId ? 1 : 0) +
  f.amenities.length +
  (f.radius ? 1 : 0) +
  (f.gamesOnly ? 1 : 0)

export const toggleAmenity = (f: Filters, id: number): Filters => ({
  ...f,
  amenities: f.amenities.includes(id)
    ? f.amenities.filter((a) => a !== id)
    : [...f.amenities, id]
})

/*
 * Atalho: um filtro fixado no topo do mapa. A chave vai para o aparelho
 * (SecureStore), então é texto estável: "hoje", "amanha", "esporte:<slug>",
 * "item:<id da característica>", "raio:<km>".
 */
export type Shortcut = string

/** Até cinco, fora o "Ao vivo", que é fixo. */
export const MAX_SHORTCUTS = 5

/** Telão e área externa, como o design abre a fileira. */
export const TELAO = 1
export const AREA_EXTERNA = 4

/** Os de quem nunca mexeu: hoje, telão, área externa e o seu esporte. */
export function defaultShortcuts(mainSport: string | null): Shortcut[] {
  return [
    'hoje',
    `item:${TELAO}`,
    `item:${AREA_EXTERNA}`,
    ...(mainSport ? [`esporte:${mainSport}`] : [])
  ]
}

export function toggleShortcut(list: Shortcut[], key: Shortcut): Shortcut[] {
  if (list.includes(key)) return list.filter((k) => k !== key)
  if (list.length >= MAX_SHORTCUTS) return list
  return [...list, key]
}

type Sport = { id: string; slug: string }

/** O atalho está ligado nos filtros de agora? */
export function shortcutOn(
  key: Shortcut,
  f: Filters,
  sports: Sport[],
  now: number
): boolean {
  if (key === 'hoje') return f.date === dayKey(now)
  if (key === 'amanha') return f.date === dayKey(now, 1)
  const [kind, value] = key.split(':')
  if (kind === 'esporte')
    return f.sportId !== null && sportBySlug(sports, value)?.id === f.sportId
  if (kind === 'item') return f.amenities.includes(Number(value))
  if (kind === 'raio') return f.radius === Number(value)
  return false
}

/** Tocar no atalho liga ou desliga o filtro dele. */
export function applyShortcut(
  key: Shortcut,
  f: Filters,
  sports: Sport[],
  now: number
): Filters {
  const on = shortcutOn(key, f, sports, now)
  if (key === 'hoje') return { ...f, date: on ? null : dayKey(now) }
  if (key === 'amanha') return { ...f, date: on ? null : dayKey(now, 1) }
  const [kind, value] = key.split(':')
  if (kind === 'esporte') {
    const sport = sportBySlug(sports, value)
    return sport ? { ...f, sportId: on ? null : sport.id } : f
  }
  if (kind === 'item') return toggleAmenity(f, Number(value))
  if (kind === 'raio') return { ...f, radius: on ? null : Number(value) }
  return f
}

const sportBySlug = (sports: Sport[], slug: string | undefined) =>
  sports.find((s) => s.slug === slug)

/** "FU", "BA", "F1", "MMA": a sigla do tile de esporte (19d). */
export function sportCode(name: string) {
  if (/f[óo]rmula\s*1/i.test(name)) return 'F1'
  const [first = '', second] = name.split(/[\s/]+/)
  // Sigla que já é sigla: "MMA / UFC" fica "MMA".
  if (first.length <= 3 && first === first.toUpperCase()) return first
  // Duas palavras: as iniciais ("Futebol Americano" é "FA", não "FU").
  if (second) return (first[0] + second[0]).toLocaleUpperCase('pt-BR')
  return first.slice(0, 2).toLocaleUpperCase('pt-BR')
}

/** Os esportes do perfil primeiro, depois o resto, cada grupo em ordem alfabética. */
export function sportsMineFirst<S extends { id: string; name: string }>(
  sports: S[],
  mine: string[]
) {
  const byName = (a: S, b: S) => a.name.localeCompare(b.name, 'pt-BR')
  return [
    ...sports.filter((s) => mine.includes(s.id)).sort(byName),
    ...sports.filter((s) => !mine.includes(s.id)).sort(byName)
  ]
}

/** "No bar" (19d): as características que o filtro oferece, na ordem do design. */
export const BAR_ITEMS = [
  { id: 1, label: 'Telão', icon: 'tv' },
  { id: 2, label: 'Som do jogo', icon: 'sound' },
  { id: 4, label: 'Área externa', icon: 'outdoor' },
  { id: 10, label: 'Oferta da casa', icon: 'ticket' },
  { id: 3, label: 'Premiere', icon: 'premiere' },
  { id: 6, label: 'Acessível', icon: 'person' }
] as const

/** "Pagamento": o cadastro do bar só tem Pix e cartão juntos. */
export const PIX_E_CARTAO = 14

/** Raios do filtro de distância. */
export const RADII = [1, 2, 5, 10] as const

/** Nome e ícone do atalho, para o chip do mapa e a lista da 19e. */
export function shortcutLabel(
  key: Shortcut,
  sports: { slug: string; name: string }[]
): { label: string; icon?: (typeof BAR_ITEMS)[number]['icon'] } | null {
  if (key === 'hoje') return { label: 'Hoje' }
  if (key === 'amanha') return { label: 'Amanhã' }
  const [kind, value] = key.split(':')
  if (kind === 'esporte') {
    const sport = sports.find((s) => s.slug === value)
    return sport ? { label: sport.name } : null
  }
  if (kind === 'item') {
    const item = BAR_ITEMS.find((i) => i.id === Number(value))
    if (item) return { label: item.label, icon: item.icon }
    return Number(value) === PIX_E_CARTAO ? { label: 'Pix e cartão' } : null
  }
  if (kind === 'raio') return { label: `Até ${value} km` }
  return null
}
