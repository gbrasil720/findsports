import {
  type MediaConfig,
  mediaBucket
} from '@findsports_oficial/auth/media-upload-record'
import { avatarPathname } from '@findsports_oficial/auth/session-image'
import { env } from '@findsports_oficial/env/server'
import { barPhotoKey } from './bar-gallery'
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from './blob-photo'
import { incrementWindow, type JanelaLimite } from './rate-limit-store'

/**
 * Upload de foto de bar e avatar direto do navegador para o R2 (WEB-202).
 *
 * A rota confere quem é o usuário e escolhe a chave; aqui só se valida o que
 * o navegador declarou (formato e tamanho) e se assina um `PUT` de 5 minutos
 * para aquela chave. O arquivo não passa pela função.
 *
 * O teto de 5 MB vale no próprio R2: `content-length` entra na assinatura, e
 * o navegador não deixa o JS mentir esse header — mandar outro tamanho
 * invalida a URL. Um `HEAD` depois do upload não serviria: a URL vale para
 * vários `PUT` durante 5 minutos, então um segundo envio maior passaria
 * depois da conferência.
 */

export class MediaUploadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/**
 * Teto de URLs assinadas por conta (relatório de vulnerabilidades de
 * 20/11/2026). A vaga da galeria só é conferida contra `bar_photo`, que nasce
 * depois do upload, então sem teto um bar enchia o bucket de arquivos sem
 * linha. 30 por hora cobre a galeria inteira (12) com folga para repetir.
 * Foto do bar e avatar dividem o contador.
 */
export const UPLOAD_LIMIT: JanelaLimite = { max: 30, windowMs: 60 * 60_000 }

export const UPLOAD_LIMIT_MESSAGE =
  'Muitos envios de foto na última hora. Tente de novo mais tarde.'

export async function assertUploadQuota(
  userId: string,
  increment: typeof incrementWindow = incrementWindow
): Promise<void> {
  const { allowed } = await increment(
    `media-upload:user:${userId}`,
    UPLOAD_LIMIT
  )
  if (!allowed) throw new MediaUploadError(429, UPLOAD_LIMIT_MESSAGE)
}

/**
 * Assina o `PUT` de `key` para o arquivo que o navegador descreveu em `body`
 * (`{ contentType, size }`). Devolve a URL do upload e a URL pública a gravar,
 * com `?v=` para furar o cache da borda no overwrite do mesmo caminho.
 */
export async function signMediaUpload(
  key: string,
  body: unknown,
  config: MediaConfig = env
): Promise<{ uploadUrl: string; url: string }> {
  const { contentType, size } = (body ?? {}) as Record<string, unknown>
  if (
    typeof contentType !== 'string' ||
    !(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)
  ) {
    throw new MediaUploadError(415, 'Formato inválido. Use JPG, PNG ou WebP.')
  }
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    throw new MediaUploadError(400, 'Tamanho do arquivo inválido.')
  }
  if (size > PHOTO_MAX_BYTES) {
    throw new MediaUploadError(413, 'Arquivo muito grande. Máximo 5MB.')
  }

  const bucket = mediaBucket(config)
  if (!bucket) {
    console.error(JSON.stringify({ event: 'media_upload_not_configured' }))
    throw new MediaUploadError(503, 'Upload de foto indisponível no momento.')
  }

  const target = new URL(bucket.objectUrl(key))
  target.searchParams.set('X-Amz-Expires', '300')
  const signed = await bucket.client.sign(target.toString(), {
    method: 'PUT',
    headers: { 'content-type': contentType, 'content-length': String(size) },
    aws: { signQuery: true, allHeaders: true }
  })

  return {
    uploadUrl: signed.url,
    url: `${bucket.publicUrl(key)}?v=${Date.now()}`
  }
}

/**
 * Apaga do bucket o avatar de quem está na sessão (WEB-320).
 *
 * A chave sai da sessão, nunca do pedido: não existe parâmetro com que um
 * usuário aponte para a foto de outro. Roda no servidor, e não por URL
 * assinada como o upload, porque o CORS do bucket só libera `PUT` ao
 * navegador. O R2 responde 204 também para chave que não existe, então
 * repetir é seguro.
 */
export async function deleteAvatar(
  session: { user: { id: string } } | null,
  config: MediaConfig = env
): Promise<void> {
  if (!session) throw new MediaUploadError(401, 'Não autorizado.')
  await deleteMediaObject(
    avatarPathname(session.user.id),
    'avatar_delete_failed',
    config
  )
}

/**
 * Apaga do bucket uma foto do bar da sessão (WEB-439, WEB-462). Quem acha a
 * linha em `bar_photo` é a rota, pelo bar da sessão: a URL do pedido só
 * escolhe qual. Foto que não está no nosso armazenamento não tem arquivo a
 * apagar.
 */
export async function deleteBarGalleryPhoto(
  session: { user: { id: string } } | null,
  bar: { id: string; userId: string } | null | undefined,
  photo: { url: string } | null | undefined,
  config: MediaConfig = env
): Promise<void> {
  if (!session) throw new MediaUploadError(401, 'Não autorizado.')
  if (!bar) throw new MediaUploadError(404, 'Bar não encontrado.')
  if (bar.userId !== session.user.id) {
    throw new MediaUploadError(403, 'Este bar não pertence à sua conta.')
  }
  if (!photo) throw new MediaUploadError(404, 'Foto não encontrada.')
  const key = barPhotoKey(photo.url, bar.id, config)
  if (!key) return
  await deleteMediaObject(key, 'bar_gallery_photo_delete_failed', config)
}

async function deleteMediaObject(
  key: string,
  failureEvent: string,
  config: MediaConfig
): Promise<void> {
  const bucket = mediaBucket(config)
  if (!bucket) {
    console.error(JSON.stringify({ event: 'media_upload_not_configured' }))
    throw new MediaUploadError(503, 'Remoção de foto indisponível no momento.')
  }

  // `sign` + `fetch`, e não `client.fetch`: este repete 10 vezes com espera
  // crescente em 5xx, e a requisição ficaria presa junto.
  const response = await fetch(
    await bucket.client.sign(bucket.apiUrl(key), { method: 'DELETE' })
  )
  if (!response.ok) {
    console.error(
      JSON.stringify({ event: failureEvent, status: response.status })
    )
    throw new MediaUploadError(502, 'Não foi possível remover a foto.')
  }
}
