import {
  isOwnMediaUrl,
  type MediaHosts
} from '@findsports_oficial/auth/session-image'
import {
  GALLERY_MAX_PHOTOS,
  PHOTO_CATEGORY_IDS,
  type PhotoCategory,
  type ReviewStatus
} from '@findsports_oficial/db/bar-gallery'
import { TRPCError } from '@trpc/server'
import { canShowBarMenu } from './bar-menu'
import { isOwnPhotoUrl } from './blob-photo'
import type { SubscriptionForPlan } from './current-plan'

export { GALLERY_MAX_PHOTOS } from '@findsports_oficial/db/bar-gallery'

/**
 * Fotos do bar (WEB-439, WEB-462), em `bar_photo`: a capa e a galeria do
 * ambiente, até `GALLERY_MAX_PHOTOS` no total, cada uma com categoria,
 * legenda e a revisão da Onside antes de aparecer.
 *
 * O upload é o da capa (WEB-202): a rota escolhe a chave, assina o `PUT` e o
 * navegador sobe direto para o R2. Cada foto tem chave própria, com um id
 * sorteado no servidor, e só entra no bar depois do upload, por
 * `pub.addPhoto`, já em revisão.
 *
 * Plano: a capa é de todos; as outras fotos seguem a regra do cardápio (Pro e
 * Elite vigentes). Ordenar, trocar a categoria e apagar não pedem plano, para
 * o dono arrumar o que tem guardado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function galleryPhotoPathname(barId: string, photoId: string): string {
  return `bars/${barId}/gallery/${photoId}`
}

/**
 * A URL é uma foto da galeria deste bar no nosso host? Mesma regra da capa:
 * sem ela o dono apontaria a página para qualquer endereço da internet.
 */
export function isOwnGalleryPhotoUrl(
  url: string,
  barId: string,
  hosts: MediaHosts
): boolean {
  let photoId: string | undefined
  try {
    photoId = new URL(url).pathname.split('/').at(-1)
  } catch {
    return false
  }
  return (
    !!photoId &&
    UUID.test(photoId) &&
    isOwnMediaUrl(url, galleryPhotoPathname(barId, photoId), hosts)
  )
}

/**
 * A chave no bucket de uma foto do bar, ou `null` se ela não é nossa. A capa
 * de antes do WEB-462 (`bars/<id>/photo`) entrou em `bar_photo` pela
 * migration e se apaga do mesmo jeito.
 */
export function barPhotoKey(
  url: string,
  barId: string,
  hosts: MediaHosts
): string | null {
  if (
    isOwnGalleryPhotoUrl(url, barId, hosts) ||
    isOwnPhotoUrl(url, barId, hosts)
  ) {
    return new URL(url).pathname.slice(1)
  }
  return null
}

export const canUseGallery = canShowBarMenu

/** A foto pedida pode entrar? A capa é de todos os planos; o resto, do Pro. */
export function assertCanAddPhoto(
  subscription: SubscriptionForPlan | null,
  cover: boolean,
  now = new Date()
): void {
  if (!cover && !canUseGallery(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A galeria de fotos é dos planos Pro e Elite.'
    })
  }
}

export const GALLERY_FULL_MESSAGE = `O bar já tem ${GALLERY_MAX_PHOTOS} fotos. Apague uma para pôr outra.`

/** Recusada não ocupa lugar: o dono manda outra no lugar dela. */
export function occupiedSlots(photos: ReadonlyArray<{ status: ReviewStatus }>) {
  return photos.filter((p) => p.status !== 'rejected').length
}

const CATEGORY_ORDER = new Map(PHOTO_CATEGORY_IDS.map((id, i) => [id, i]))

/** Na ordem da página: por categoria (a do design), depois pela do dono. */
export function byCategoryThenPosition<
  T extends { category: PhotoCategory; position: number }
>(photos: readonly T[]): T[] {
  return [...photos].sort(
    (a, b) =>
      (CATEGORY_ORDER.get(a.category) ?? 0) -
        (CATEGORY_ORDER.get(b.category) ?? 0) || a.position - b.position
  )
}

/**
 * O que a página do bar mostra: só as aprovadas, e nada sem Pro/Elite
 * vigente. A capa continua em `bar.photo_url`, para todos os planos.
 */
export function resolvePublicGallery<
  T extends { category: PhotoCategory; position: number; status: ReviewStatus }
>(
  stored: readonly T[],
  subscription: SubscriptionForPlan | null,
  now = new Date()
): T[] {
  if (!canUseGallery(subscription, now)) return []
  return byCategoryThenPosition(stored.filter((p) => p.status === 'approved'))
}
