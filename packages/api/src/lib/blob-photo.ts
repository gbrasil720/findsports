import {
  isOwnMediaUrl,
  type MediaHosts
} from '@findsports_oficial/auth/session-image'

/**
 * Regras da foto do bar (ESC-15).
 *
 * O upload vai do navegador direto para o armazenamento, sem atravessar a
 * função serverless. Quem decide onde o arquivo cai é o servidor: desde o
 * WEB-202 ele escolhe a chave e assina a URL do PUT (`media-upload.ts`), então
 * o cliente não manda caminho nenhum.
 */

/** 5 MB, o mesmo teto que a rota antiga aplicava. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const

export function photoPathname(barId: string): string {
  return `bars/${barId}/photo`
}

/**
 * A URL veio mesmo do nosso armazenamento e aponta para a foto deste bar?
 *
 * Usada ao gravar `photoUrl`: como é o cliente que informa a URL depois de
 * subir o arquivo, aceitar qualquer string deixaria um bar apontar a própria
 * foto para um endereço arbitrário na internet.
 */
export function isOwnPhotoUrl(
  url: string,
  barId: string,
  hosts: MediaHosts
): boolean {
  return isOwnMediaUrl(url, photoPathname(barId), hosts)
}
