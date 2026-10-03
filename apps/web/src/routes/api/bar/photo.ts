import { photoPathname } from '@findsports_oficial/api/lib/blob-photo'
import {
  MediaUploadError,
  signMediaUpload
} from '@findsports_oficial/api/lib/media-upload'
import { auth } from '@findsports_oficial/auth'
import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createFileRoute } from '@tanstack/react-router'

/**
 * ESC-15: esta rota não transporta bytes. Só decide se o upload pode
 * acontecer e devolve uma URL assinada de curta duração; o arquivo vai do
 * navegador direto para o R2 (WEB-202).
 *
 * A chave é escolhida aqui, a partir do bar da sessão: o cliente manda só
 * formato e tamanho, então não há caminho vindo dele para validar.
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
            columns: { id: true }
          })
          if (!existingBar) {
            throw new MediaUploadError(404, 'Bar não encontrado.')
          }

          return Response.json(
            await signMediaUpload(photoPathname(existingBar.id), body)
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
      }
    }
  }
})
