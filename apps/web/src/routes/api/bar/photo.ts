import { auth } from '@findsports_oficial/auth'
import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createFileRoute } from '@tanstack/react-router'
import { put } from '@vercel/blob'

export const Route = createFileRoute('/api/bar/photo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })

        if (!session) {
          return Response.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        if (session.user.role !== 'pub') {
          return Response.json(
            { error: 'Apenas bares podem fazer upload de foto.' },
            { status: 403 }
          )
        }

        const existingBar = await db.query.bar.findFirst({
          where: eq(bar.userId, session.user.id)
        })

        if (!existingBar) {
          return Response.json(
            { error: 'Bar não encontrado.' },
            { status: 404 }
          )
        }

        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          return Response.json(
            { error: 'Nenhum arquivo enviado.' },
            { status: 400 }
          )
        }

        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
        if (!ALLOWED_TYPES.includes(file.type)) {
          return Response.json(
            { error: 'Formato inválido. Use JPG, PNG ou WebP.' },
            { status: 400 }
          )
        }

        const MAX_SIZE = 5 * 1024 * 1024
        if (file.size > MAX_SIZE) {
          return Response.json(
            { error: 'Arquivo muito grande. Máximo 5MB.' },
            { status: 400 }
          )
        }

        const blob = await put(`bars/${existingBar.id}/photo`, file, {
          access: 'public',
          contentType: file.type,
          addRandomSuffix: false
        })

        await db
          .update(bar)
          .set({ photoUrl: blob.url })
          .where(eq(bar.id, existingBar.id))

        return Response.json({ url: blob.url })
      }
    }
  }
})
