import { expect, test } from 'bun:test'
import { and, eq } from '@findsports_oficial/db'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import {
  bar,
  barPhoto,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import {
  GALLERY_FULL_MESSAGE,
  GALLERY_MAX_PHOTOS,
  galleryPhotoPathname
} from '../lib/bar-gallery'
import {
  contextFor,
  inAMonth,
  load,
  type Plan,
  refusal,
  seedBar
} from './integration-seed'

/**
 * Fotos do bar (WEB-439, WEB-462) contra o banco de verdade: toda foto entra
 * em revisão e só a aprovada chega ao torcedor; a capa vira `bar.photo_url`
 * quando é aprovada; o teto de 12 vale no servidor, também em paralelo; cada
 * dono só mexe no próprio bar; cada decisão do Houdini fica no Grimório.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const foto = (barId: string) =>
  `${env.MEDIA_PUBLIC_ORIGIN}/${galleryPhotoPathname(barId, crypto.randomUUID())}?v=1`

async function admin() {
  const { appRouter } = await load()
  return appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
}

async function coverOf(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ photoUrl: bar.photoUrl })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.photoUrl
}

async function grimorio(barId: string) {
  const { db } = await load()
  return db
    .select({ kind: adminAction.kind, detail: adminAction.detail })
    .from(adminAction)
    .where(
      and(eq(adminAction.targetType, 'bar'), eq(adminAction.targetId, barId))
    )
}

integrationTest(
  'foto entra em revisão; o torcedor só vê depois de aprovada, por categoria',
  async () => {
    const ctx = await seedBar('pro', 'active', inAMonth())
    const houdini = await admin()
    try {
      const comida = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'comida',
        caption: '  Porção de fritas  '
      })
      const telao = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'telao',
        caption: 'O telão de 120" do salão principal'
      })
      expect(comida.status).toBe('pending')
      expect(comida.caption).toBe('Porção de fritas')
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).photos).toEqual([])

      const fila = await houdini.adminReview.queue()
      expect(
        fila.photos.filter((p) => p.barId === ctx.barId).map((p) => p.id)
      ).toEqual([comida.id, telao.id])

      await houdini.adminReview.decidePhoto({
        photoId: comida.id,
        approve: true
      })
      await houdini.adminReview.decidePhoto({
        photoId: telao.id,
        approve: true
      })
      const publicas = (await ctx.fan.pubs.getById({ id: ctx.barId })).photos
      // Telão antes de Comida, a ordem do design.
      expect(publicas.map((p) => p.id)).toEqual([telao.id, comida.id])
      expect(publicas[0]?.caption).toBe('O telão de 120" do salão principal')

      // Decidir de novo é recusado: a fila não aprova duas vezes.
      expect(
        (
          await refusal(
            houdini.adminReview.decidePhoto({
              photoId: comida.id,
              approve: false,
              reason: 'tarde'
            })
          )
        ).code
      ).toBe('CONFLICT')
      expect((await grimorio(ctx.barId)).map((e) => e.kind)).toEqual([
        'bar.photo_approve',
        'bar.photo_approve'
      ])
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'recusa leva o motivo ao dono, não ocupa lugar e fica no Grimório',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const houdini = await admin()
    try {
      const photo = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'balcao'
      })
      // Sem motivo não recusa.
      expect(
        (
          await refusal(
            houdini.adminReview.decidePhoto({
              photoId: photo.id,
              approve: false,
              reason: '   '
            })
          )
        ).code
      ).toBe('BAD_REQUEST')
      await houdini.adminReview.decidePhoto({
        photoId: photo.id,
        approve: false,
        reason: 'Tem pessoas identificáveis no primeiro plano.'
      })
      const [mine] = await ctx.owner.pub.photos()
      expect(mine?.status).toBe('rejected')
      expect(mine?.rejectionReason).toBe(
        'Tem pessoas identificáveis no primeiro plano.'
      )
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).photos).toEqual([])
      const [entry] = await grimorio(ctx.barId)
      expect(entry?.kind).toBe('bar.photo_reject')
      expect((entry?.detail as { reason: string }).reason).toBe(
        'Tem pessoas identificáveis no primeiro plano.'
      )
      // Recusada não pode virar capa.
      expect(
        (await refusal(ctx.owner.pub.setPhotoCover({ id: photo.id }))).code
      ).toBe('PRECONDITION_FAILED')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'a capa: Starter manda, vira bar.photo_url só quando aprovada',
  async () => {
    const ctx = await seedBar('starter', 'active', inAMonth())
    const houdini = await admin()
    try {
      // Starter não põe foto na galeria, mas põe a capa.
      expect(
        (
          await refusal(
            ctx.owner.pub.addPhoto({ url: foto(ctx.barId), category: 'telao' })
          )
        ).code
      ).toBe('FORBIDDEN')
      const capa = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'fachada',
        cover: true
      })
      expect(capa.coverRequested).toBe(true)
      expect(await coverOf(ctx.barId)).toBeNull()

      const { cover } = await houdini.adminReview.decidePhoto({
        photoId: capa.id,
        approve: true
      })
      expect(cover).toBe(true)
      expect(await coverOf(ctx.barId)).toBe(capa.url)
      // A galeria do Starter fica vazia; a capa aparece pela photoUrl.
      const page = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(page.photos).toEqual([])
      expect(page.photoUrl).toBe(capa.url)

      // Nova capa em revisão: a antiga segue no ar até a aprovação.
      const nova = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'salao',
        cover: true
      })
      expect(await coverOf(ctx.barId)).toBe(capa.url)
      await houdini.adminReview.decidePhoto({
        photoId: nova.id,
        approve: false,
        reason: 'Foto escura demais.'
      })
      expect(await coverOf(ctx.barId)).toBe(capa.url)
      // Pedido recusado não fica pendurado.
      expect(
        (await ctx.owner.pub.photos()).filter((p) => p.coverRequested)
      ).toEqual([])
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'foto aprovada vira capa na hora; em revisão, quando for aprovada',
  async () => {
    const ctx = await seedBar('pro', 'active', inAMonth())
    const houdini = await admin()
    try {
      const a = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'telao'
      })
      await houdini.adminReview.decidePhoto({ photoId: a.id, approve: true })
      expect(await ctx.owner.pub.setPhotoCover({ id: a.id })).toEqual({
        cover: 'now'
      })
      expect(await coverOf(ctx.barId)).toBe(a.url)

      const b = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'telao'
      })
      expect(await ctx.owner.pub.setPhotoCover({ id: b.id })).toEqual({
        cover: 'on_approval'
      })
      expect(await coverOf(ctx.barId)).toBe(a.url)
      await houdini.adminReview.decidePhoto({ photoId: b.id, approve: true })
      expect(await coverOf(ctx.barId)).toBe(b.url)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'perder o plano esconde a galeria do perfil sem apagar; ordenar continua',
  async () => {
    const ctx = await seedBar('pro', 'active', inAMonth())
    const houdini = await admin()
    try {
      const a = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'telao'
      })
      const b = await ctx.owner.pub.addPhoto({
        url: foto(ctx.barId),
        category: 'telao'
      })
      for (const p of [a, b]) {
        await houdini.adminReview.decidePhoto({ photoId: p.id, approve: true })
      }
      await ctx.owner.pub.reorderPhotos({ ids: [b.id, a.id] })
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).photos.map((p) => p.id)
      ).toEqual([b.id, a.id])

      await ctx.owner.pub.setPhotoCategory({ id: a.id, category: 'fachada' })
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).photos.map(
          (p) => p.category
        )
      ).toEqual(['telao', 'fachada'])

      await ctx.db
        .update(subscription)
        .set({ plan: 'starter' satisfies Plan })
        .where(eq(subscription.barId, ctx.barId))
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).photos).toEqual([])
      expect(await ctx.owner.pub.photos()).toHaveLength(2)
      await ctx.owner.pub.reorderPhotos({ ids: [a.id, b.id] })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  `o teto de ${GALLERY_MAX_PHOTOS} fotos vale no servidor, também em paralelo`,
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      const results = await Promise.allSettled(
        Array.from({ length: GALLERY_MAX_PHOTOS + 3 }, () =>
          ctx.owner.pub.addPhoto({ url: foto(ctx.barId), category: 'salao' })
        )
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
        GALLERY_MAX_PHOTOS
      )
      const extra = await refusal(
        ctx.owner.pub.addPhoto({ url: foto(ctx.barId), category: 'salao' })
      )
      expect(extra.code).toBe('CONFLICT')
      expect(extra.message).toBe(GALLERY_FULL_MESSAGE)

      // Recusada libera o lugar.
      const [first] = await ctx.owner.pub.photos()
      await (await admin()).adminReview.decidePhoto({
        photoId: first?.id ?? '',
        approve: false,
        reason: 'Imagem de banco.'
      })
      await ctx.owner.pub.addPhoto({ url: foto(ctx.barId), category: 'salao' })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'cada dono só mexe nas próprias fotos, e só com URL do nosso host',
  async () => {
    const mine = await seedBar('pro', 'active', inAMonth())
    const other = await seedBar('pro', 'active', inAMonth())
    try {
      const theirs = await other.owner.pub.addPhoto({
        url: foto(other.barId),
        category: 'telao'
      })

      // Foto do outro bar, outro host e a capa antiga: recusadas.
      for (const url of [
        theirs.url,
        `https://outro.host/${galleryPhotoPathname(mine.barId, crypto.randomUUID())}`,
        `${env.MEDIA_PUBLIC_ORIGIN}/bars/${mine.barId}/photo`
      ]) {
        expect(
          (await refusal(mine.owner.pub.addPhoto({ url, category: 'telao' })))
            .code
        ).toBe('BAD_REQUEST')
      }
      const own = await mine.owner.pub.addPhoto({
        url: foto(mine.barId),
        category: 'telao'
      })
      expect(
        (
          await refusal(
            mine.owner.pub.addPhoto({ url: own.url, category: 'telao' })
          )
        ).code
      ).toBe('CONFLICT')
      // Legenda acima de 80 caracteres.
      expect(
        (
          await refusal(
            mine.owner.pub.addPhoto({
              url: foto(mine.barId),
              category: 'telao',
              caption: 'x'.repeat(81)
            })
          )
        ).code
      ).toBe('BAD_REQUEST')

      // Ordem com foto de outro bar, faltando ou repetida não grava.
      for (const ids of [[theirs.id], [], [own.id, own.id]]) {
        expect(
          (await refusal(mine.owner.pub.reorderPhotos({ ids }))).code
        ).toMatch(/CONFLICT|BAD_REQUEST/)
      }
      for (const call of [
        () => mine.owner.pub.setPhotoCover({ id: theirs.id }),
        () =>
          mine.owner.pub.setPhotoCategory({ id: theirs.id, category: 'comida' })
      ]) {
        expect((await refusal(call())).code).toBe('NOT_FOUND')
      }
      const [stored] = await mine.db
        .select({ category: barPhoto.category })
        .from(barPhoto)
        .where(eq(barPhoto.id, theirs.id))
      expect(stored?.category).toBe('telao')

      // Torcedor e dono não chegam à fila do Houdini.
      expect(
        (
          await refusal(
            mine.fan.pub.addPhoto({ url: own.url, category: 'telao' })
          )
        ).code
      ).toBe('FORBIDDEN')
      for (const caller of [mine.owner, mine.fan]) {
        expect((await refusal(caller.adminReview.queue())).code).toBe(
          'FORBIDDEN'
        )
      }
    } finally {
      await mine.cleanup()
      await other.cleanup()
    }
  }
)
