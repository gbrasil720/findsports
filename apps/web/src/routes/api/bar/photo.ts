import {
  isOwnPhotoPathname,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-photo'
import { auth } from '@findsports_oficial/auth'
import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createFileRoute } from '@tanstack/react-router'
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client'

class PhotoRouteError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/**
 * ESC-15: esta rota recebia o arquivo inteiro.
 *
 * O corpo era lido em memória com `formData()` e só então repassado ao
 * armazenamento — até 5 MB de memória, tempo de execução e banda de função
 * para uma operação que o próprio armazenamento faz sozinho.
 *
 * Agora ela não transporta bytes: só decide se aquele upload pode acontecer e
 * emite um token de curta duração. O arquivo vai do navegador direto para o
 * armazenamento.
 *
 * A autorização não afrouxou por isso — mudou de lugar. O helper entrega o
 * caminho pedido pelo cliente e permite RECUSAR, não reescrever; por isso a
 * validação do caminho é obrigatória, e é o que impede um bar autenticado de
 * gravar na pasta de outro.
 */
export const Route = createFileRoute('/api/bar/photo')({
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
          if (!session) throw new PhotoRouteError(401, 'Não autorizado.')
          if (!session.user.emailVerified) {
            throw new PhotoRouteError(
              403,
              'Confirme seu e-mail para continuar.'
            )
          }
          if (session.user.role !== 'pub') {
            throw new PhotoRouteError(
              403,
              'Apenas bares podem fazer upload de foto.'
            )
          }

          const existingBar = await db.query.bar.findFirst({
            where: eq(bar.userId, session.user.id),
            columns: { id: true }
          })
          if (!existingBar) {
            throw new PhotoRouteError(404, 'Bar não encontrado.')
          }
          if (
            body.type === 'blob.generate-client-token' &&
            !isOwnPhotoPathname(body.payload.pathname, existingBar.id)
          ) {
            throw new PhotoRouteError(400, 'Caminho não permitido.')
          }

          const resultado = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname) => {
              if (!isOwnPhotoPathname(pathname, existingBar.id)) {
                throw new PhotoRouteError(400, 'Caminho não permitido.')
              }

              // O teto e os formatos passam a ser aplicados pelo próprio
              // armazenamento, antes de o arquivo existir — e não depois de
              // ele já ter atravessado a função.
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
          if (err instanceof PhotoRouteError) {
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
