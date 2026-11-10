import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import type { Icon } from '@/components/ui'

/*
 * Filtros do Explorar (19d do design) e os atalhos no topo do mapa (19e).
 * Contas puras; o estado mora em `components/explore-state.tsx`.
 */

/** O que a busca recebe além do centro. `null` é "qualquer". */
export type Filters = {
  /** Dia de Brasília, "2026-10-20". */
  date: string | null
  sportId: string | null
  /**
   * O campeonato dentro do esporte: o basquete tem dois chips, NBA e NBB
   * (dono, 10/11/2026). `null` é o esporte inteiro.
   */
  league?: string | null
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
  league: null,
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
  championship: f.league ?? undefined,
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
 * "liga:<campeonato>" (NBA, NBB), "item:<id da característica>", "raio:<km>".
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
    return (
      f.sportId !== null &&
      !f.league &&
      sportBySlug(sports, value)?.id === f.sportId
    )
  if (kind === 'liga') return f.league === value
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
    return sport ? { ...f, sportId: on ? null : sport.id, league: null } : f
  }
  if (kind === 'liga') {
    const sport = sports.find((s) => LEAGUES[s.slug]?.includes(value as string))
    return sport
      ? on
        ? { ...f, sportId: null, league: null }
        : { ...f, sportId: sport.id, league: value ?? null }
      : f
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

type IconName = Parameters<typeof Icon>[0]['name']

/**
 * As características do filtro em grupos, na ordem e com os nomes curtos da
 * folha da rodada 5 (19d), um ícone para cada. Os grupos são os do catálogo
 * (`lib/amenities.ts` do servidor); "Estacionamento" é o próximo (9), que
 * inclui o do local.
 */
export const FILTER_GROUPS: readonly {
  title: string
  items: readonly { id: number; label: string; icon: IconName }[]
}[] = [
  {
    title: 'Para ver o jogo',
    items: [
      { id: 1, label: 'Telão', icon: 'tv' },
      { id: 2, label: 'Som do jogo', icon: 'sound' },
      { id: 3, label: 'Premiere', icon: 'premiere' }
    ]
  },
  {
    title: 'O espaço',
    items: [
      { id: 4, label: 'Área externa', icon: 'outdoor' },
      { id: 5, label: 'Área coberta', icon: 'coberta' },
      { id: 6, label: 'Acessível', icon: 'acessivel' },
      { id: 7, label: 'Pet friendly', icon: 'pet' },
      { id: 15, label: 'Wi-fi', icon: 'wifi' }
    ]
  },
  {
    title: 'Comida e bebida',
    items: [
      { id: 13, label: 'Chopp', icon: 'beer' },
      { id: 12, label: 'Petiscos', icon: 'petiscos' },
      { id: 11, label: 'Cozinha até tarde', icon: 'cozinha' },
      { id: 20, label: 'Vegetariana', icon: 'vegetariano' },
      { id: 21, label: 'Drinks', icon: 'drinks' },
      { id: 10, label: 'Oferta da casa', icon: 'ticket' }
    ]
  },
  {
    title: 'Pagamento',
    items: [
      { id: 16, label: 'Pix', icon: 'pix' },
      { id: 17, label: 'Cartão', icon: 'cartao' },
      { id: 18, label: 'Vale-refeição', icon: 'vale' },
      { id: 19, label: 'Couvert', icon: 'couvert' }
    ]
  },
  {
    title: 'Para chegar',
    items: [
      { id: 22, label: 'Perto do metrô', icon: 'metro' },
      { id: 23, label: 'Bicicletário', icon: 'bike' },
      { id: 9, label: 'Estacionamento', icon: 'estacionamento' }
    ]
  }
]

/** Todas as características do filtro, na ordem da folha. */
export const BAR_ITEMS = FILTER_GROUPS.flatMap((group) => group.items)

/** O nome curto de uma característica do filtro ("Telão", "Pix"). */
export function itemLabel(id: number): string | undefined {
  return BAR_ITEMS.find((i) => i.id === id)?.label
}

/** Esportes que viram um chip por campeonato no filtro (dono, 10/11/2026). */
export const LEAGUES: Record<string, string[]> = { basquete: ['NBA', 'NBB'] }

/** O ícone do esporte pelo slug; o nome curto do chip ("F1", "UFC"). */
const SPORT_LOOK: Record<string, { icon: IconName; short?: string }> = {
  futebol: { icon: 'futebol' },
  basquete: { icon: 'basquete' },
  'formula-1': { icon: 'f1', short: 'F1' },
  'mma-ufc': { icon: 'ufc', short: 'UFC' },
  'futebol-americano': { icon: 'nfl', short: 'NFL' },
  tenis: { icon: 'tenis' },
  volei: { icon: 'volei' }
}

export function sportLook(sport: { slug: string; name: string }): {
  label: string
  icon?: IconName
} {
  const look = SPORT_LOOK[sport.slug]
  return { label: look?.short ?? sport.name, icon: look?.icon }
}

/** Raios do filtro de distância. */
export const RADII = [1, 2, 5, 10] as const

/** Nome e ícone do atalho, para o chip do mapa e a lista da 19e. */
export function shortcutLabel(
  key: Shortcut,
  sports: { slug: string; name: string }[]
): { label: string; icon?: IconName } | null {
  if (key === 'hoje') return { label: 'Hoje', icon: 'calendar' }
  if (key === 'amanha') return { label: 'Amanhã', icon: 'calendar' }
  const [kind, value] = key.split(':')
  if (kind === 'esporte') {
    const sport = sports.find((s) => s.slug === value)
    return sport ? sportLook(sport) : null
  }
  if (kind === 'liga' && value) return { label: value, icon: 'basquete' }
  if (kind === 'item') {
    const item = BAR_ITEMS.find((i) => i.id === Number(value))
    return item ? { label: item.label, icon: item.icon } : null
  }
  if (kind === 'raio') return { label: `Até ${value} km`, icon: 'pin' }
  return null
}
