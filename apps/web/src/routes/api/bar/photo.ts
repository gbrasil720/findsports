import {
  canUseGallery,
  GALLERY_MAX_PHOTOS,
  galleryPhotoPathname
} from '@findsports_oficial/api/lib/bar-gallery'
import { photoPathname } from '@findsports_oficial/api/lib/blob-photo'
import {
  deleteBarGalleryPhoto,
  deleteBarPhoto,
  MediaUploadError,
  signMediaUpload
} from '@findsports_oficial/api/lib/media-upload'
import { auth } from '@findsports_oficial/auth'
import {
  isReadOnlyImpersonation,
  READ_ONLY_IMPERSONATION_MESSAGE
} from '@findsports_oficial/auth/impersonation-mode'
import { db, eq, sql } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createFileRoute } from '@tanstack/react-router'

/**
 * ESC-15: esta rota não transporta bytes. Só decide se o upload pode
 * acontecer e devolve uma URL assinada de curta duração; o arquivo vai do
 * navegador direto para o R2 (WEB-202).
 *
 * A chave é escolhida aqui, a partir do bar da sessão: o cliente manda só
 * formato e tamanho, então não há caminho vindo dele para validar.
 *
 * `?galeria` é uma foto da galeria do ambiente (WEB-439): chave nova a cada
 * foto, só com Pro/Elite e espaço na galeria. A URL entra no bar depois do
 * upload, por `pub.addGalleryPhoto`, que confere tudo de novo.
 */
export const Route = createFileRoute('/api/bar/photo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return Response.json({ error: 'Corpo inválido.' }, { status: 400 })
          }

          const session = await auth.api.getSession({
            headers: request.headers
          })
          if (!session) throw new MediaUploadError(401, 'Não autorizado.')
          if (isReadOnlyImpersonation(session, request.headers)) {
            throw new MediaUploadError(403, READ_ONLY_IMPERSONATION_MESSAGE)
          }
          if (!session.user.emailVerified) {
            throw new MediaUploadError(
              403,
              'Confirme seu e-mail para continuar.'
            )
          }
          if (session.user.role !== 'pub') {
            throw new MediaUploadError(
              403,
              'Apenas bares podem fazer upload de foto.'
            )
          }

          const existingBar = await db.query.bar.findFirst({
            where: eq(bar.userId, session.user.id),
            columns: { id: true, galleryPhotos: true },
            with: {
              subscription: {
                columns: { plan: true, status: true, currentPeriodEnd: true }
              }
            }
          })
          if (!existingBar) {
            throw new MediaUploadError(404, 'Bar não encontrado.')
          }

          if (!new URL(request.url).searchParams.has('galeria')) {
            return Response.json(
              await signMediaUpload(photoPathname(existingBar.id), body)
            )
          }
          if (!canUseGallery(existingBar.subscription ?? null)) {
            throw new MediaUploadError(
              403,
              'A galeria de fotos é dos planos Pro e Elite.'
            )
          }
          if (existingBar.galleryPhotos.length >= GALLERY_MAX_PHOTOS) {
            throw new MediaUploadError(
              409,
              `A galeria já tem ${GALLERY_MAX_PHOTOS} fotos. Apague uma para pôr outra.`
            )
          }
          return Response.json(
            await signMediaUpload(
              galleryPhotoPathname(existingBar.id, crypto.randomUUID()),
              body
            )
          )
        } catch (err) {
          if (err instanceof MediaUploadError) {
            return Response.json({ error: err.message }, { status: err.status })
          }
          console.error(JSON.stringify({ event: 'bar_photo_route_failed' }))
          return Response.json(
            { error: 'Não foi possível autorizar o upload.' },
            { status: 500 }
          )
        }
      },
      // Remoção da foto. O bar é o da sessão: o pedido não tem corpo nem
      // parâmetro. Arquivo primeiro, referência depois — se a segunda etapa
      // falhar, repetir conserta (apagar de novo é inofensivo); na ordem
      // inversa sobraria um arquivo no ar sem botão que o alcance.
      //
      // A referência é zerada aqui, e não por `pub.updateMe` como na troca de
      // foto: aquele procedimento não aceita `photoUrl` nulo.
      //
      // `?galeria=<url>` apaga uma foto da galeria (WEB-439), na mesma ordem.
      // Não pede plano: o dono arruma o que ficou guardado.
      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers
          })
          if (isReadOnlyImpersonation(session, request.headers)) {
            throw new MediaUploadError(403, READ_ONLY_IMPERSONATION_MESSAGE)
          }
          const ownBar = session
            ? await db.query.bar.findFirst({
                where: eq(bar.userId, session.user.id),
                columns: { id: true, userId: true, galleryPhotos: true }
              })
            : null
          const galeria = new URL(request.url).searchParams.get('galeria')
          if (galeria !== null) {
            await deleteBarGalleryPhoto(session, ownBar, galeria)
            if (ownBar) {
              await db
                .update(bar)
                .set({
                  galleryPhotos: sql`array_remove(${bar.galleryPhotos}, ${galeria})`
                })
                .where(eq(bar.id, ownBar.id))
            }
            return new Response(null, { status: 204 })
          }
          await deleteBarPhoto(session, ownBar)
          if (ownBar) {
            await db
              .update(bar)
              .set({ photoUrl: null })
              .where(eq(bar.id, ownBar.id))
          }
          return new Response(null, { status: 204 })
        } catch (err) {
          if (err instanceof MediaUploadError) {
            return Response.json({ error: err.message }, { status: err.status })
          }
          console.error(
            JSON.stringify({ event: 'bar_photo_delete_route_failed' })
          )
          return Response.json(
            { error: 'Não foi possível remover a foto.' },
            { status: 500 }
          )
        }
      }
    }
  }
})
