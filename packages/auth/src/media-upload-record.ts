import { and, asc, db, eq, isNull, like, lt, or } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { mediaUpload } from '@findsports_oficial/db/schema/media'
import { barPhoto } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { AwsClient } from 'aws4fetch'
import { isOwnMediaUrl } from './session-image'

/**
 * O bucket de mídia (`onside-media`, WEB-202) e o rastro de cada chave que o
 * servidor assina (`media_upload`).
 *
 * A URL assinada só prende formato e tamanho; os bytes vão do navegador
 * direto ao R2. Por isso: a rota grava a chave ao assinar
 * (`recordMediaUpload`), e o arquivo só entra no app (`pub.addPhoto`, ou
 * `image` no `/update-user`) se a chave foi assinada para aquela conta e os
 * primeiros bytes são de JPG, PNG ou WebP, iguais ao `content-type` que o R2
 * guardou (`checkMediaUpload`). O que nunca entra sai do bucket depois de
 * 24 h (`cleanupPendingMedia`, rotina `media_cleanup`).
 *
 * Limite conhecido: a URL assinada vale 5 minutos e aceita outro `PUT` do
 * mesmo tamanho nesse tempo, então quem confirmar e subir de novo na mesma
 * janela troca os bytes depois da conferência. O formato servido continua
 * preso à assinatura (`image/*`).
 */

export const MEDIA_BUCKET = 'onside-media'

export type MediaConfig = Pick<
  typeof env,
  | 'R2_MEDIA_ACCESS_KEY_ID'
  | 'R2_MEDIA_SECRET_ACCESS_KEY'
  | 'CF_ACCOUNT_ID'
  | 'MEDIA_PUBLIC_ORIGIN'
> &
  Partial<Pick<typeof env, 'R2_MEDIA_API_BASE_URL'>>

/** Cliente S3 do bucket, ou `null` se alguma das quatro variáveis faltar. */
export function mediaBucket(config: MediaConfig = env) {
  const {
    R2_MEDIA_ACCESS_KEY_ID: accessKeyId,
    R2_MEDIA_SECRET_ACCESS_KEY: secretAccessKey,
    CF_ACCOUNT_ID: accountId,
    MEDIA_PUBLIC_ORIGIN: publicOrigin,
    R2_MEDIA_API_BASE_URL: apiBase
  } = config
  if (!accessKeyId || !secretAccessKey || !accountId || !publicOrigin) {
    return null
  }
  const objectUrl = (key: string) =>
    `https://${accountId}.r2.cloudflarestorage.com/${MEDIA_BUCKET}/${key}`
  return {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto'
    }),
    objectUrl,
    /** Onde o servidor lê e apaga: o R2, ou o stub do E2E. */
    apiUrl: (key: string) =>
      apiBase
        ? `${apiBase.replace(/\/$/, '')}/${MEDIA_BUCKET}/${key}`
        : objectUrl(key),
    publicUrl: (key: string) => `${new URL(publicOrigin).origin}/${key}`
  }
}

export type MediaKind = (typeof mediaUpload.$inferInsert)['kind']

/** O formato pelos primeiros bytes, ou `null` se não é JPG, PNG nem WebP. */
export function sniffImage(
  bytes: Uint8Array
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const at = (offset: number, magic: number[]) =>
    magic.every((b, i) => bytes[offset + i] === b)
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  // "RIFF" <tamanho> "WEBP"
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) {
    return 'image/webp'
  }
  return null
}

/** Os bytes batem com o `content-type` que o R2 vai servir? */
export function bytesMatchContentType(
  bytes: Uint8Array,
  contentType: string | null
): boolean {
  const declared = contentType?.split(';')[0]?.trim().toLowerCase()
  return !!declared && sniffImage(bytes) === declared
}

export type MediaStore = {
  /** Começo do objeto e o `content-type` guardado; `null` se não existe. */
  head(
    key: string
  ): Promise<{ bytes: Uint8Array; contentType: string | null } | null>
  remove(key: string): Promise<void>
}

class MediaStoreUnavailable extends Error {}

function r2Store(): MediaStore {
  const bucket = () => {
    const b = mediaBucket()
    if (!b) throw new MediaStoreUnavailable()
    return b
  }
  return {
    async head(key) {
      const b = bucket()
      // `sign` + `fetch`, e não `client.fetch`, que repete 10 vezes em 5xx.
      const response = await fetch(
        await b.client.sign(b.apiUrl(key), {
          method: 'GET',
          headers: { range: 'bytes=0-15' }
        })
      )
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`r2_head_${response.status}`)
      return {
        bytes: new Uint8Array(await response.arrayBuffer()).slice(0, 16),
        contentType: response.headers.get('content-type')
      }
    },
    async remove(key) {
      const b = bucket()
      const response = await fetch(
        await b.client.sign(b.apiUrl(key), { method: 'DELETE' })
      )
      // O R2 responde 204 também para chave que não existe.
      if (!response.ok) throw new Error(`r2_delete_${response.status}`)
    }
  }
}

let storeOverride: MediaStore | null = null

/** Dublê do bucket nos testes; `null` volta ao R2. */
export function setMediaStore(store: MediaStore | null) {
  storeOverride = store
}

function store(): MediaStore {
  return storeOverride ?? r2Store()
}

/** Grava a chave que a rota acabou de assinar para `userId`. */
export async function recordMediaUpload(input: {
  userId: string
  key: string
  kind: MediaKind
}): Promise<void> {
  await db.insert(mediaUpload).values(input)
}

export class MediaCheckError extends Error {}

const pendingOf = ({
  userId,
  key,
  kind
}: {
  userId: string
  key: string
  kind: MediaKind
}) =>
  and(
    eq(mediaUpload.userId, userId),
    eq(mediaUpload.key, key),
    eq(mediaUpload.kind, kind),
    isNull(mediaUpload.confirmedAt)
  )

/**
 * A chave foi assinada para esta conta, ainda sem confirmar, e o arquivo é
 * uma imagem do formato assinado? Arquivo que não é imagem sai do bucket na
 * hora. Não grava a confirmação: quem grava é `confirmMediaUpload`, junto
 * com a linha que usa a foto.
 */
export async function checkMediaUpload(input: {
  userId: string
  key: string
  kind: MediaKind
}): Promise<void> {
  const [pending] = await db
    .select({ id: mediaUpload.id })
    .from(mediaUpload)
    .where(pendingOf(input))
    .limit(1)
  if (!pending) {
    throw new MediaCheckError(
      'Esta foto não foi enviada por esta conta. Envie de novo.'
    )
  }

  let head: Awaited<ReturnType<MediaStore['head']>>
  try {
    head = await store().head(input.key)
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'media_upload_check_failed',
        reason: err instanceof MediaStoreUnavailable ? 'not_configured' : 'r2'
      })
    )
    throw new MediaCheckError('Upload de foto indisponível no momento.')
  }
  if (!head) throw new MediaCheckError('A foto não chegou. Envie de novo.')

  if (!bytesMatchContentType(head.bytes, head.contentType)) {
    console.error(
      JSON.stringify({ event: 'media_upload_not_image', kind: input.kind })
    )
    await store()
      .remove(input.key)
      .catch(() =>
        console.error(JSON.stringify({ event: 'media_upload_remove_failed' }))
      )
    await db.delete(mediaUpload).where(pendingOf(input))
    throw new MediaCheckError(
      'O arquivo não é uma imagem JPG, PNG ou WebP. Envie outra foto.'
    )
  }
}

type Executor = Pick<typeof db, 'update'>

/**
 * Marca a chave como usada. `false` se outra confirmação chegou antes (o
 * mesmo envio mandado duas vezes).
 */
export async function confirmMediaUpload(
  input: { userId: string; key: string; kind: MediaKind },
  executor: Executor = db
): Promise<boolean> {
  const rows = await executor
    .update(mediaUpload)
    .set({ confirmedAt: new Date() })
    .where(pendingOf(input))
    .returning({ id: mediaUpload.id })
  return rows.length > 0
}

const PENDING_TTL_MS = 24 * 60 * 60 * 1000

/**
 * O arquivo ainda está em uso, apesar da linha sem confirmar? O avatar tem
 * chave fixa: com `user.image` apontando para ela, apagar tiraria a foto
 * atual. A foto do bar não deveria estar em `bar_photo` sem confirmação, mas
 * o código anterior (rollback) grava sem confirmar.
 */
async function stillInUse(row: {
  key: string
  kind: MediaKind
  userId: string
}): Promise<boolean> {
  if (row.kind === 'avatar') {
    const [owner] = await db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, row.userId))
    return !!owner?.image && isOwnMediaUrl(owner.image, row.key, env)
  }
  const [photo] = await db
    .select({ id: barPhoto.id })
    .from(barPhoto)
    .where(
      or(
        like(barPhoto.url, `%/${row.key}`),
        like(barPhoto.url, `%/${row.key}?%`)
      )
    )
    .limit(1)
  return !!photo
}

/**
 * Apaga do bucket o que foi assinado há mais de 24 h e nunca entrou no app,
 * e as linhas. `limit` por execução: o resto fica para o dia seguinte.
 * Falha ao apagar mantém a linha, para tentar de novo amanhã.
 */
export async function cleanupPendingMedia({
  now = new Date(),
  limit = 100
}: {
  now?: Date
  limit?: number
} = {}): Promise<{ removed: number; kept: number; failed: number }> {
  const rows = await db
    .select({
      id: mediaUpload.id,
      key: mediaUpload.key,
      kind: mediaUpload.kind,
      userId: mediaUpload.userId
    })
    .from(mediaUpload)
    .where(
      and(
        isNull(mediaUpload.confirmedAt),
        lt(mediaUpload.createdAt, new Date(now.getTime() - PENDING_TTL_MS))
      )
    )
    .orderBy(asc(mediaUpload.createdAt))
    .limit(limit)

  const result = { removed: 0, kept: 0, failed: 0 }
  for (const row of rows) {
    if (await stillInUse(row)) {
      result.kept++
    } else {
      try {
        await store().remove(row.key)
        result.removed++
      } catch {
        result.failed++
        continue
      }
    }
    await db.delete(mediaUpload).where(eq(mediaUpload.id, row.id))
  }
  if (result.failed > 0) {
    throw new Error(
      `${result.failed} de ${rows.length} arquivos não saíram do bucket`
    )
  }
  return result
}
