/**
 * Fotos do bar (WEB-439, WEB-462): a capa e a galeria do ambiente, cada uma
 * com categoria, legenda e a revisão da Onside antes de aparecer. Vive no
 * pacote do banco pelo mesmo motivo de `bar-menu.ts`: o CHECK da tabela, o
 * procedimento que grava, o painel e o app leem os mesmos valores. Não importa
 * nada do Drizzle para poder ir ao navegador.
 */

/**
 * Quantas fotos o bar guarda, capa incluída, em revisão ou no ar (recusada
 * não conta). O mesmo número em todos os planos (decisão do dono, 28/10/2026).
 */
export const GALLERY_MAX_PHOTOS = 12

/** Teto antigo de `bar.gallery_photos` (migration 0077), que só se lê até sair. */
export const LEGACY_GALLERY_MAX_PHOTOS = 8

/** Legenda da foto (design 28c, "34/80"). */
export const PHOTO_CAPTION_MAX = 80

/** Motivo da recusa, escrito no Houdini e lido pelo dono. */
export const REVIEW_REASON_MAX = 300

/**
 * As categorias do design (28c), na ordem em que a galeria do torcedor as
 * agrupa (25c). O id é o valor do enum `bar_photo_category`: nunca reusar.
 */
export const PHOTO_CATEGORIES = [
  { id: 'telao', label: 'Telão' },
  { id: 'area_externa', label: 'Área externa' },
  { id: 'balcao', label: 'Balcão' },
  { id: 'comida', label: 'Comida' },
  { id: 'salao', label: 'Salão' },
  { id: 'fachada', label: 'Fachada' }
] as const

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]['id']

export const PHOTO_CATEGORY_IDS = PHOTO_CATEGORIES.map((c) => c.id) as [
  PhotoCategory,
  ...PhotoCategory[]
]

export function photoCategoryLabel(id: PhotoCategory): string {
  return PHOTO_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

/** Revisão da Onside (WEB-462, WEB-478): fotos e descrição do bar. */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
