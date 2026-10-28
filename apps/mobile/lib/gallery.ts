import {
  groupByCategory,
  type PhotoCategory,
  photoCategoryLabel
} from '@findsports_oficial/db/bar-gallery'

/*
 * Fotos do bar para o torcedor (25a–25c, WEB-462): só as que a Onside
 * aprovou, já por categoria e na ordem do dono (`pubs.getById`). Aqui só as
 * contas das telas.
 */

export type GalleryPhoto = {
  id: string
  url: string
  category: PhotoCategory
  caption: string | null
  createdAt: string | Date
}

/** `Tudo` mais uma por categoria com foto, com a contagem (os chips). */
export type GalleryFilter = 'all' | PhotoCategory

export function galleryChips(photos: readonly GalleryPhoto[]) {
  return [
    { key: 'all' as GalleryFilter, label: 'Tudo', count: photos.length },
    ...groupByCategory(photos).map((g) => ({
      key: g.id as GalleryFilter,
      label: g.label,
      count: g.photos.length
    }))
  ]
}

export function filterPhotos<T extends GalleryPhoto>(
  photos: readonly T[],
  filter: GalleryFilter
): T[] {
  return filter === 'all'
    ? [...photos]
    : photos.filter((p) => p.category === filter)
}

/** O filtro que veio na URL, se for um que existe nas fotos. */
export function parseFilter(
  photos: readonly GalleryPhoto[],
  raw: string | undefined
): GalleryFilter {
  return photos.some((p) => p.category === raw) ? (raw as PhotoCategory) : 'all'
}

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

/** "set 2026", no relógio de Brasília (25b: "Enviada pelo Bar do Zé · set 2026"). */
export function sentMonth(date: string | Date): string {
  // Brasília é UTC-3 o ano todo desde 2019.
  const d = new Date(new Date(date).getTime() - 3 * 3_600_000)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export const categoryLabel = photoCategoryLabel
