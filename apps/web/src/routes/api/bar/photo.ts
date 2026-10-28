import {
  canUseGallery,
  GALLERY_FULL_MESSAGE,
  GALLERY_MAX_PHOTOS,
  galleryPhotoPathname,
  occupiedSlots
} from '@findsports_oficial/api/lib/bar-gallery'
import {
  deleteBarGalleryPhoto,
  MediaUploadError,
  signMediaUpload
} from '@findsports_oficial/api/lib/media-upload'
import { auth } from '@findsports_oficial/auth'
import {
  isReadOnlyImpersonation,
  READ_ONLY_IMPERSONATION_MESSAGE
} from '@findsports_oficial/auth/impersonation-mode'
import { and, db, eq } from '@findsports_oficial/db'
import { bar, barPhoto } from '@findsports_oficial/db/schema/platform'
import { createFileRoute } from '@tanstack/react-router'

/**
 * ESC-15: esta rota não transporta bytes. Só decide se o upload pode
 * acontecer e devolve uma URL assinada de curta duração; o arquivo vai do
 * navegador direto para o R2 (WEB-202).
 *
 * A chave é escolhida aqui, a partir do bar da sessão: o cliente manda só
 * formato e tamanho, então não há caminho vindo dele para validar.
 *
 * Toda foto do bar é da galeria (WEB-439, WEB-462), a capa também: chave
 * nova a cada foto, com espaço no bar, e só com Pro/Elite, menos a capa
 * (`?capa`). A URL entra no bar depois do upload, por `pub.addPhoto`, que
 * confere tudo de novo e a põe em revisão. `?galeria` é o nome antigo e
 * continua valendo.
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
            columns: { id: true },
            with: {
              subscription: {
                columns: { plan: true, status: true, currentPeriodEnd: true }
              },
              photos: { columns: { status: true } }
            }
          })
          if (!existingBar) {
            throw new MediaUploadError(404, 'Bar não encontrado.')
          }

          const capa = new URL(request.url).searchParams.has('capa')
          if (!capa && !canUseGallery(existingBar.subscription ?? null)) {
            throw new MediaUploadError(
              403,
              'A galeria de fotos é dos planos Pro e Elite.'
            )
          }
          if (occupiedSlots(existingBar.photos) >= GALLERY_MAX_PHOTOS) {
            throw new MediaUploadError(409, GALLERY_FULL_MESSAGE)
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
      // Remoção de uma foto do bar (`?galeria=<url>`), da sessão. Arquivo
      // primeiro, linha depois — se a segunda etapa falhar, repetir conserta
      // (apagar de novo é inofensivo); na ordem inversa sobraria um arquivo no
      // ar sem botão que o alcance. Não pede plano: o dono arruma o que ficou
      // guardado. Se era a capa, o bar fica sem capa.
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
                columns: { id: true, userId: true, photoUrl: true }
              })
            : null
          const url = new URL(request.url).searchParams.get('galeria') ?? ''
          const photo = ownBar
            ? await db.query.barPhoto.findFirst({
                where: and(
                  eq(barPhoto.barId, ownBar.id),
                  eq(barPhoto.url, url)
                ),
                columns: { id: true, url: true }
              })
            : null
          await deleteBarGalleryPhoto(session, ownBar, photo)
          if (ownBar && photo) {
            await db.delete(barPhoto).where(eq(barPhoto.id, photo.id))
            if (ownBar.photoUrl === photo.url) {
              await db
                .update(bar)
                .set({ photoUrl: null })
                .where(eq(bar.id, ownBar.id))
            }
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
