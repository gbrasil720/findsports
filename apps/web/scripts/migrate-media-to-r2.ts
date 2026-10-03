/**
 * Copia fotos de bar e avatares do Vercel Blob para o R2 e reescreve as URLs
 * no banco (WEB-202, passo 8).
 *
 *     NODE_ENV=production bun --env-file=apps/web/.env \
 *       apps/web/scripts/migrate-media-to-r2.ts            # simulação (padrão)
 *     NODE_ENV=production bun --env-file=apps/web/.env \
 *       apps/web/scripts/migrate-media-to-r2.ts --apply    # copia e reescreve
 *
 * Sem `--apply` só lista o que faria: nenhuma rede, nenhuma escrita.
 *
 * Com `--apply`, para cada `bar.photo_url` / `user.image` ainda no Blob: baixa
 * o objeto, sobe para a mesma chave no bucket (`bars/<id>/photo`,
 * `users/<id>/avatar`) com o `content-type` e o `cache-control` de origem e,
 * no fim, reescreve numa transação só as linhas cuja cópia deu certo. A
 * reescrita só troca a URL se ela ainda for a mesma lida no começo: quem
 * subiu foto nova no meio do caminho fica com a dela.
 *
 * Idempotente: linha já reescrita não volta na consulta, e uma cópia que
 * falhou é tentada de novo na rodada seguinte.
 *
 * Variáveis: `DATABASE_URL` (com `NODE_ENV=production`), e as quatro do
 * upload — `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`,
 * `CF_ACCOUNT_ID`, `MEDIA_PUBLIC_ORIGIN`. Nenhuma é impressa.
 */

import { photoPathname } from '@findsports_oficial/api/lib/blob-photo'
import { mediaBucket } from '@findsports_oficial/api/lib/media-upload'
import { avatarPathname } from '@findsports_oficial/auth/session-image'
import { and, db, eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'

const BLOB_URL = /^https:\/\/[a-z0-9_-]+\.public\.blob\.vercel-storage\.com\//i
/** O mesmo do Vercel Blob quando a origem não diz (um mês). */
const DEFAULT_CACHE_CONTROL = 'public, max-age=2592000'

type Row = { table: 'bar' | 'user'; id: string; url: string; key: string }

const apply = process.argv.includes('--apply')
const bucket = mediaBucket()
if (!bucket) {
  console.error(
    'Faltam R2_MEDIA_ACCESS_KEY_ID, R2_MEDIA_SECRET_ACCESS_KEY, CF_ACCOUNT_ID ou MEDIA_PUBLIC_ORIGIN.'
  )
  process.exit(1)
}

const like = '%.blob.vercel-storage.com/%'
const rows: Row[] = [
  ...(
    await db
      .select({ id: bar.id, url: bar.photoUrl })
      .from(bar)
      .where(sql`${bar.photoUrl} LIKE ${like}`)
  ).map((r) => ({
    table: 'bar' as const,
    id: r.id,
    url: r.url ?? '',
    key: photoPathname(r.id)
  })),
  ...(
    await db
      .select({ id: user.id, url: user.image })
      .from(user)
      .where(sql`${user.image} LIKE ${like}`)
  ).map((r) => ({
    table: 'user' as const,
    id: r.id,
    url: r.url ?? '',
    key: avatarPathname(r.id)
  }))
]

// Só migra o que o validador aceitaria: o Blob, no caminho exato da linha.
const valid = rows.filter(
  (r) => BLOB_URL.test(r.url) && new URL(r.url).pathname === `/${r.key}`
)
for (const r of rows.filter((r) => !valid.includes(r))) {
  console.warn(`ignorada  ${r.table} ${r.id}: URL fora do padrão`)
}

console.log(
  `${valid.length} objeto(s) no Blob (${valid.filter((r) => r.table === 'bar').length} bar, ${valid.filter((r) => r.table === 'user').length} user) → ${bucket.publicUrl('')}`
)

if (!apply) {
  for (const r of valid) console.log(`copiaria  ${r.table} ${r.id} → ${r.key}`)
  console.log('Simulação. Rode com --apply para copiar e reescrever.')
  await db.$client.end()
  process.exit(0)
}

// ponytail: uma cópia por vez; poucas centenas de arquivos. Paralelizar se o volume crescer.
const copied: Row[] = []
for (const r of valid) {
  try {
    const source = await fetch(r.url)
    if (!source.ok) throw new Error(`Blob respondeu ${source.status}`)
    const put = await bucket.client.fetch(bucket.objectUrl(r.key), {
      method: 'PUT',
      body: await source.arrayBuffer(),
      headers: {
        'content-type':
          source.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control':
          source.headers.get('cache-control') ?? DEFAULT_CACHE_CONTROL
      }
    })
    if (!put.ok) throw new Error(`R2 respondeu ${put.status}`)
    copied.push(r)
    console.log(`copiada   ${r.table} ${r.id} → ${r.key}`)
  } catch (err) {
    console.error(
      `falhou    ${r.table} ${r.id}: ${err instanceof Error ? err.message : 'erro'}`
    )
  }
}

const rewritten = await db.transaction(async (tx) => {
  let count = 0
  for (const r of copied) {
    const url = bucket.publicUrl(r.key)
    const updated =
      r.table === 'bar'
        ? await tx
            .update(bar)
            .set({ photoUrl: url })
            .where(and(eq(bar.id, r.id), eq(bar.photoUrl, r.url)))
            .returning({ id: bar.id })
        : await tx
            .update(user)
            .set({ image: url })
            .where(and(eq(user.id, r.id), eq(user.image, r.url)))
            .returning({ id: user.id })
    if (updated.length === 0) {
      // A foto nova caiu na mesma chave antes da cópia velha: o banco fica
      // com a URL nova, mas o objeto pode ter voltado ao antigo.
      console.warn(
        `mudou     ${r.table} ${r.id}: URL trocada durante a cópia; peça novo upload`
      )
    }
    count += updated.length
  }
  return count
})

console.log(
  `${copied.length}/${valid.length} copiada(s), ${rewritten} URL(s) reescrita(s).`
)
await db.$client.end()
process.exit(copied.length === valid.length ? 0 : 1)
