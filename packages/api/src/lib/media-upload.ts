import { env } from '@findsports_oficial/env/server'
import { AwsClient } from 'aws4fetch'
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from './blob-photo'

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

const MEDIA_BUCKET = 'onside-media'

type MediaConfig = Pick<
  typeof env,
  | 'R2_MEDIA_ACCESS_KEY_ID'
  | 'R2_MEDIA_SECRET_ACCESS_KEY'
  | 'CF_ACCOUNT_ID'
  | 'MEDIA_PUBLIC_ORIGIN'
>

export class MediaUploadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Cliente S3 do bucket, ou `null` se alguma das quatro variáveis faltar. */
export function mediaBucket(config: MediaConfig = env) {
  const {
    R2_MEDIA_ACCESS_KEY_ID: accessKeyId,
    R2_MEDIA_SECRET_ACCESS_KEY: secretAccessKey,
    CF_ACCOUNT_ID: accountId,
    MEDIA_PUBLIC_ORIGIN: publicOrigin
  } = config
  if (!accessKeyId || !secretAccessKey || !accountId || !publicOrigin) {
    return null
  }
  return {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto'
    }),
    objectUrl: (key: string) =>
      `https://${accountId}.r2.cloudflarestorage.com/${MEDIA_BUCKET}/${key}`,
    publicUrl: (key: string) => `${new URL(publicOrigin).origin}/${key}`
  }
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
