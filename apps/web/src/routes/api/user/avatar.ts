import {
  isOwnAvatarPathname,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-avatar'
import { auth } from '@findsports_oficial/auth'
import { createFileRoute } from '@tanstack/react-router'
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client'

class AvatarRouteError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export const Route = createFileRoute('/api/user/avatar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: HandleUploadBody
          try {
            body = (await request.json()) as HandleUploadBody
          } catch {
            return Response.json({ error: 'Corpo inválido.' }, { status: 400 })
          }

          const session = await auth.api.getSession({
            headers: request.headers
          })
          if (!session) {
            throw new AvatarRouteError(401, 'Não autorizado.')
          }
          if (!session.user.emailVerified) {
            throw new AvatarRouteError(
              403,
              'Confirme seu e-mail para continuar.'
            )
          }

          if (
            body.type === 'blob.generate-client-token' &&
            !isOwnAvatarPathname(body.payload.pathname, session.user.id)
          ) {
            throw new AvatarRouteError(400, 'Caminho não permitido.')
          }

          const resultado = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname) => {
              if (!isOwnAvatarPathname(pathname, session.user.id)) {
                throw new AvatarRouteError(400, 'Caminho não permitido.')
              }
              return {
                allowedContentTypes: [...PHOTO_CONTENT_TYPES],
                maximumSizeInBytes: PHOTO_MAX_BYTES,
                addRandomSuffix: false,
                allowOverwrite: true
              }
            }
          })

          return Response.json(resultado)
        } catch (err) {
          if (err instanceof AvatarRouteError) {
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
