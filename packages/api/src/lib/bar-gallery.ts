import {
  isOwnMediaUrl,
  type MediaHosts
} from '@findsports_oficial/auth/session-image'
import { TRPCError } from '@trpc/server'
import { canShowBarMenu } from './bar-menu'
import type { SubscriptionForPlan } from './current-plan'

export { GALLERY_MAX_PHOTOS } from '@findsports_oficial/db/bar-gallery'

/**
 * Galeria de fotos do ambiente (WEB-439): até `GALLERY_MAX_PHOTOS` fotos além
 * da capa, em `bar.gallery_photos`, na ordem da página.
 *
 * O upload é o da capa (WEB-202): a rota escolhe a chave, assina o `PUT` e o
 * navegador sobe direto para o R2. Cada foto tem chave própria, com um id
 * sorteado no servidor, e a URL só entra no bar depois do upload, por
 * `pub.addGalleryPhoto`.
 *
 * O plano segue a regra do cardápio (Pro e Elite vigentes): gravar foto nova
 * pede o plano; ordenar e apagar não, para o dono arrumar o que tem guardado.
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

/** A chave no bucket de uma URL já conferida por `isOwnGalleryPhotoUrl`. */
export function galleryPhotoKey(url: string): string {
  return new URL(url).pathname.slice(1)
}

export const canUseGallery = canShowBarMenu

export function assertCanUseGallery(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canUseGallery(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A galeria de fotos é dos planos Pro e Elite.'
    })
  }
}

/** O que a página do bar mostra: nada sem Pro/Elite vigente. */
export function resolvePublicGallery(
  stored: string[],
  subscription: SubscriptionForPlan | null,
  now = new Date()
): string[] {
  return canUseGallery(subscription, now) ? stored : []
}
