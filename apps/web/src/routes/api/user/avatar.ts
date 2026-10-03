import {
  MediaUploadError,
  signMediaUpload
} from '@findsports_oficial/api/lib/media-upload'
import { auth } from '@findsports_oficial/auth'
import { avatarPathname } from '@findsports_oficial/auth/session-image'
import { createFileRoute } from '@tanstack/react-router'

/** Mesmo desenho de `api/bar/photo`: a chave sai da sessão, não do cliente. */
export const Route = createFileRoute('/api/user/avatar')({
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
          if (!session) {
            throw new MediaUploadError(401, 'Não autorizado.')
          }
          if (!session.user.emailVerified) {
            throw new MediaUploadError(
              403,
              'Confirme seu e-mail para continuar.'
            )
          }

          return Response.json(
            await signMediaUpload(avatarPathname(session.user.id), body)
          )
        } catch (err) {
          if (err instanceof MediaUploadError) {
            return Response.json({ error: err.message }, { status: err.status })
          }
          console.error(JSON.stringify({ event: 'user_avatar_route_failed' }))
          return Response.json(
            { error: 'Não foi possível autorizar o upload.' },
            { status: 500 }
          )
        }
      }
    }
  }
})
