import { afterAll, beforeAll, expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type { MediaStore } from './media-upload-record'

/**
 * O rastro das chaves do bucket contra o banco de verdade, com o R2 dublado:
 * só confirma a chave assinada para a conta e com bytes de imagem, apaga na
 * hora o que não é imagem, e a rotina tira do bucket o que ficou 24 h sem
 * confirmar, menos o que ainda está em uso.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const HTML = new TextEncoder().encode('<html><script>')

const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
const removed: string[] = []
const fakeStore: MediaStore = {
  head: async (key) => objects.get(key) ?? null,
  remove: async (key) => {
    removed.push(key)
    objects.delete(key)
  }
}

async function load() {
  const [db, auth, media, platform, record] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/schema/auth'),
    import('@findsports_oficial/db/schema/media'),
    import('@findsports_oficial/db/schema/platform'),
    import('./media-upload-record')
  ])
  return { ...db, ...auth, ...media, ...platform, ...record }
}

beforeAll(async () => (await load()).setMediaStore(fakeStore))
afterAll(async () => (await load()).setMediaStore(null))

async function seedUser() {
  const { db, user } = await load()
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    name: 'Upload de integração',
    email: `${id}@integration.invalid`,
    emailVerified: true,
    role: 'pub',
    onboardingCompleted: true
  })
  return id
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('aceitou o que devia recusar')
}

integrationTest(
  'só confirma a chave assinada para a conta, com bytes de imagem',
  async () => {
    const {
      db,
      eq,
      user,
      mediaUpload,
      recordMediaUpload,
      checkMediaUpload,
      confirmMediaUpload
    } = await load()
    const owner = await seedUser()
    const other = await seedUser()
    try {
      const key = `bars/x/gallery/${crypto.randomUUID()}`
      const upload = { userId: owner, key, kind: 'bar_photo' as const }

      // Sem assinatura, ou assinada para outra conta: recusada.
      expect(await refusal(checkMediaUpload(upload))).toContain(
        'não foi enviada'
      )
      await recordMediaUpload(upload)
      expect(
        await refusal(checkMediaUpload({ ...upload, userId: other }))
      ).toContain('não foi enviada')

      // Assinada, mas o PUT não aconteceu.
      expect(await refusal(checkMediaUpload(upload))).toContain('não chegou')

      // Bytes de JPEG com content-type de PNG: não passa e sai do bucket.
      objects.set(key, { bytes: JPEG, contentType: 'image/png' })
      expect(await refusal(checkMediaUpload(upload))).toContain(
        'não é uma imagem'
      )
      expect(removed).toContain(key)
      expect(
        await db.select().from(mediaUpload).where(eq(mediaUpload.key, key))
      ).toHaveLength(0)

      // HTML com content-type de imagem: idem.
      const html = { ...upload, key: `bars/x/gallery/${crypto.randomUUID()}` }
      await recordMediaUpload(html)
      objects.set(html.key, { bytes: HTML, contentType: 'image/jpeg' })
      expect(await refusal(checkMediaUpload(html))).toContain(
        'não é uma imagem'
      )
      expect(removed).toContain(html.key)

      // JPEG de verdade: passa, confirma uma vez só.
      const ok = { ...upload, key: `bars/x/gallery/${crypto.randomUUID()}` }
      await recordMediaUpload(ok)
      objects.set(ok.key, { bytes: JPEG, contentType: 'image/jpeg' })
      await checkMediaUpload(ok)
      expect(await confirmMediaUpload(ok)).toBe(true)
      expect(await confirmMediaUpload(ok)).toBe(false)
      expect(await refusal(checkMediaUpload(ok))).toContain('não foi enviada')
    } finally {
      await db.delete(user).where(eq(user.id, owner))
      await db.delete(user).where(eq(user.id, other))
    }
  }
)

integrationTest(
  'a rotina apaga o que passou de 24 h sem confirmar, menos o que está em uso',
  async () => {
    const {
      db,
      eq,
      inArray,
      user,
      bar,
      barPhoto,
      mediaUpload,
      cleanupPendingMedia
    } = await load()
    const { env } = await import('@findsports_oficial/env/server')
    const owner = await seedUser()
    const barId = crypto.randomUUID()
    const now = new Date()
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    const k = () => `bars/${barId}/gallery/${crypto.randomUUID()}`
    const orphan = k()
    const recent = k()
    const confirmed = k()
    const inGallery = k()
    const avatar = `users/${owner}/avatar`
    try {
      await db.insert(bar).values({
        id: barId,
        userId: owner,
        name: 'Bar da limpeza',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800'
      })
      // Gravada sem confirmar, como faria o código anterior num rollback.
      await db.insert(barPhoto).values({
        barId,
        url: `${env.MEDIA_PUBLIC_ORIGIN}/${inGallery}?v=1`,
        category: 'salao',
        position: 0
      })
      await db
        .update(user)
        .set({ image: `${env.MEDIA_PUBLIC_ORIGIN}/${avatar}?v=1` })
        .where(eq(user.id, owner))
      await db.insert(mediaUpload).values([
        { userId: owner, key: orphan, kind: 'bar_photo', createdAt: old },
        { userId: owner, key: recent, kind: 'bar_photo', createdAt: now },
        {
          userId: owner,
          key: confirmed,
          kind: 'bar_photo',
          createdAt: old,
          confirmedAt: old
        },
        { userId: owner, key: inGallery, kind: 'bar_photo', createdAt: old },
        { userId: owner, key: avatar, kind: 'avatar', createdAt: old }
      ])
      removed.length = 0

      expect(await cleanupPendingMedia({ now })).toMatchObject({
        removed: 1,
        kept: 2,
        failed: 0
      })
      expect(removed).toEqual([orphan])
      const left = await db
        .select({ key: mediaUpload.key })
        .from(mediaUpload)
        .where(
          inArray(mediaUpload.key, [
            orphan,
            recent,
            confirmed,
            inGallery,
            avatar
          ])
        )
      expect(left.map((r) => r.key).sort()).toEqual([confirmed, recent].sort())

      // Um teto por execução.
      await db.insert(mediaUpload).values(
        Array.from({ length: 3 }, () => ({
          userId: owner,
          key: k(),
          kind: 'bar_photo' as const,
          createdAt: old
        }))
      )
      expect((await cleanupPendingMedia({ now, limit: 2 })).removed).toBe(2)
    } finally {
      await db.delete(user).where(eq(user.id, owner))
    }
  }
)

integrationTest(
  '/update-user só aceita avatar novo com envio aberto e bytes de imagem',
  async () => {
    const { db, eq, sql, user, account, rateLimit, recordMediaUpload } =
      await load()
    const { auth } = await import('./index')
    const { env } = await import('@findsports_oficial/env/server')
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
    const password = 'Senha-de-teste-avatar!'
    const octet = () => Math.floor(Math.random() * 256)
    const clientIp = `10.${octet()}.${octet()}.${octet()}`
    const post = (path: string, cookie: string, body: unknown) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth${path}`, {
          method: 'POST',
          headers: {
            cookie,
            origin: baseUrl,
            'content-type': 'application/json',
            'x-forwarded-for': clientIp
          },
          body: JSON.stringify(body)
        })
      )

    const id = await seedUser()
    const key = `users/${id}/avatar`
    const image = (v: number) => `${env.MEDIA_PUBLIC_ORIGIN}/${key}?v=${v}`
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: await (await auth.$context).password.hash(password)
    })
    try {
      const signIn = await post('/sign-in/email', '', {
        email: `${id}@integration.invalid`,
        password
      })
      expect(signIn.status).toBe(200)
      const cookie = signIn.headers
        .getSetCookie()
        .map((pair) => pair.split(';')[0])
        .join('; ')
      const imageOf = async () =>
        (await db.select().from(user).where(eq(user.id, id)))[0]?.image

      // Sem envio assinado.
      expect(
        (await post('/update-user', cookie, { image: image(1) })).status
      ).toBe(400)

      // Envio assinado, mas o arquivo é HTML.
      await recordMediaUpload({ userId: id, key, kind: 'avatar' })
      objects.set(key, { bytes: HTML, contentType: 'image/jpeg' })
      expect(
        (await post('/update-user', cookie, { image: image(2) })).status
      ).toBe(400)
      expect(await imageOf()).toBeNull()
      expect(objects.has(key)).toBe(false)

      // Envio assinado com JPEG: grava.
      await recordMediaUpload({ userId: id, key, kind: 'avatar' })
      objects.set(key, { bytes: JPEG, contentType: 'image/jpeg' })
      expect(
        (await post('/update-user', cookie, { image: image(3) })).status
      ).toBe(200)
      expect(await imageOf()).toBe(image(3))

      // Outro `?v=` sem envio novo: recusado.
      expect(
        (await post('/update-user', cookie, { image: image(4) })).status
      ).toBe(400)
      // Limpar não pede envio.
      expect((await post('/update-user', cookie, { image: null })).status).toBe(
        200
      )
    } finally {
      objects.delete(key)
      await db.delete(user).where(eq(user.id, id))
      await db
        .delete(rateLimit)
        .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
    }
  }
)
