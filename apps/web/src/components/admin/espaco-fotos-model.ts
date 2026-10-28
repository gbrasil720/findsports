import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-photo'
import {
  groupByCategory,
  type PhotoCategory,
  type ReviewStatus
} from '@findsports_oficial/db/bar-gallery'

/*
 * Fotos do Meu espaço (WEB-462, telas 28b e 28c): as contas puras da seção,
 * para a tela e os testes lerem a mesma regra.
 */

export type FotoDoDono = {
  id: string
  url: string
  category: PhotoCategory
  caption: string | null
  coverRequested: boolean
  status: ReviewStatus
  rejectionReason: string | null
}

/** "11 publicadas · 2 em revisão · 1 recusada" (28b). */
export function contagemDaRevisao(fotos: readonly FotoDoDono[]) {
  return {
    publicadas: fotos.filter((f) => f.status === 'approved').length,
    emRevisao: fotos.filter((f) => f.status === 'pending').length,
    recusadas: fotos.filter((f) => f.status === 'rejected').length
  }
}

/**
 * A ordem nova depois de pôr `id` no lugar de `alvo`, dentro da mesma
 * categoria; `null` se as duas não são da mesma categoria ou nada muda. A
 * lista recebida está na ordem do dono; a devolvida tem todas as fotos, por
 * categoria, como `pub.reorderPhotos` espera.
 */
export function moverFoto(
  fotos: readonly FotoDoDono[],
  id: string,
  alvo: string
): string[] | null {
  const de = fotos.find((f) => f.id === id)
  const para = fotos.find((f) => f.id === alvo)
  if (!de || !para || de === para || de.category !== para.category) return null
  return groupByCategory(fotos).flatMap((grupo) => {
    const ids = grupo.photos.map((f) => f.id)
    if (grupo.id !== de.category) return ids
    const sem = ids.filter((x) => x !== id)
    sem.splice(ids.indexOf(alvo), 0, id)
    return sem
  })
}

/** A vizinha na categoria, para as setas ‹ › (o arrastar sem mouse). */
export function vizinha(
  fotos: readonly FotoDoDono[],
  id: string,
  passo: -1 | 1
): string | null {
  const foto = fotos.find((f) => f.id === id)
  if (!foto) return null
  const ids = fotos.filter((f) => f.category === foto.category).map((f) => f.id)
  return ids[ids.indexOf(id) + passo] ?? null
}

/** O arquivo escolhido serve? Formato e tamanho de novo no servidor, ao assinar. */
export function problemaDoArquivo(file: {
  type: string
  size: number
}): string | null {
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato inválido. Use JPG, PNG ou WebP.'
  }
  if (file.size > PHOTO_MAX_BYTES) return 'Arquivo muito grande. Máximo 5MB.'
  return null
}
