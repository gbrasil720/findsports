import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import { GALLERY_MAX_PHOTOS, galleryPhotoPathname } from '../lib/bar-gallery'
import { inAMonth, type Plan, refusal, seedBar } from './integration-seed'

/**
 * Galeria do ambiente (WEB-439) contra o banco de verdade: só Pro e Elite
 * põem foto, o teto vale no servidor, cada dono só mexe no próprio bar, a
 * ordem é a do dono e perder o plano esconde sem apagar.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const foto = (barId: string) =>
  `${env.MEDIA_PUBLIC_ORIGIN}/${galleryPhotoPathname(barId, crypto.randomUUID())}?v=1`

async function stored(barId: string) {
  const ctx = await import('@findsports_oficial/db')
  const [row] = await ctx.db
    .select({ galleryPhotos: bar.galleryPhotos })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.galleryPhotos
}

for (const plan of ['pro', 'elite'] as const) {
  integrationTest(`dono ${plan} põe, ordena e o perfil mostra`, async () => {
    const ctx = await seedBar(plan, 'active', inAMonth())
    try {
      const [a, b, c] = [foto(ctx.barId), foto(ctx.barId), foto(ctx.barId)]
      for (const url of [a, b, c]) {
        await ctx.owner.pub.addGalleryPhoto({ url })
      }
      expect(await stored(ctx.barId)).toEqual([a, b, c])

      await ctx.owner.pub.reorderGallery({ photos: [c, a, b] })
      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.galleryPhotos).toEqual([c, a, b])
    } finally {
      await ctx.cleanup()
    }
  })
}

integrationTest(
  'Starter não põe foto; perder o plano esconde do perfil sem apagar',
  async () => {
    const ctx = await seedBar('pro', 'active', inAMonth())
    try {
      const url = foto(ctx.barId)
      await ctx.owner.pub.addGalleryPhoto({ url })
      await ctx.db
        .update(subscription)
        .set({ plan: 'starter' satisfies Plan })
        .where(eq(subscription.barId, ctx.barId))

      expect(
        (await refusal(ctx.owner.pub.addGalleryPhoto({ url: foto(ctx.barId) })))
          .code
      ).toBe('FORBIDDEN')
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).galleryPhotos
      ).toEqual([])
      expect(await stored(ctx.barId)).toEqual([url])
      // O dono ainda arruma o que ficou guardado.
      await ctx.owner.pub.reorderGallery({ photos: [url] })

      // Plano parado (past_due) também não põe.
      await ctx.db
        .update(subscription)
        .set({ plan: 'pro', status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))
      expect(
        (await refusal(ctx.owner.pub.addGalleryPhoto({ url: foto(ctx.barId) })))
          .code
      ).toBe('FORBIDDEN')
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
      const urls = Array.from({ length: GALLERY_MAX_PHOTOS + 3 }, () =>
        foto(ctx.barId)
      )
      const results = await Promise.allSettled(
        urls.map((url) => ctx.owner.pub.addGalleryPhoto({ url }))
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
        GALLERY_MAX_PHOTOS
      )
      expect(await stored(ctx.barId)).toHaveLength(GALLERY_MAX_PHOTOS)

      const extra = await refusal(
        ctx.owner.pub.addGalleryPhoto({ url: foto(ctx.barId) })
      )
      expect(extra.code).toBe('CONFLICT')
      expect(extra.message).toBe(
        `A galeria já tem ${GALLERY_MAX_PHOTOS} fotos. Apague uma para pôr outra.`
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'cada dono só mexe na própria galeria, e só com URL do nosso host',
  async () => {
    const mine = await seedBar('pro', 'active', inAMonth())
    const other = await seedBar('pro', 'active', inAMonth())
    try {
      const theirs = foto(other.barId)
      await other.owner.pub.addGalleryPhoto({ url: theirs })

      // Foto do outro bar, outro host, a capa e repetida: recusadas.
      for (const url of [
        theirs,
        `https://outro.host/${galleryPhotoPathname(mine.barId, crypto.randomUUID())}`,
        `${env.MEDIA_PUBLIC_ORIGIN}/bars/${mine.barId}/photo`
      ]) {
        expect(
          (await refusal(mine.owner.pub.addGalleryPhoto({ url }))).code
        ).toBe('BAD_REQUEST')
      }
      const own = foto(mine.barId)
      await mine.owner.pub.addGalleryPhoto({ url: own })
      expect(
        (await refusal(mine.owner.pub.addGalleryPhoto({ url: own }))).code
      ).toBe('CONFLICT')

      // Ordem com foto de outro bar, faltando ou repetida não grava.
      for (const photos of [[theirs], [], [own, own]]) {
        expect(
          (await refusal(mine.owner.pub.reorderGallery({ photos }))).code
        ).toMatch(/CONFLICT|BAD_REQUEST/)
      }
      expect(await stored(mine.barId)).toEqual([own])
      expect(await stored(other.barId)).toEqual([theirs])

      // Torcedor não chega aos procedimentos do bar.
      expect(
        (await refusal(mine.fan.pub.addGalleryPhoto({ url: own }))).code
      ).toBe('FORBIDDEN')
    } finally {
      await mine.cleanup()
      await other.cleanup()
    }
  }
)
