import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { getBarPathById } from '@/functions/public-bar'

/**
 * Endereço antigo da página do bar. Os links já mandados no WhatsApp, o QR e
 * o "Compartilhar" do app (`apps/mobile/app/bar/[id].tsx`), o painel e o
 * Houdini usam `/pub/<id>`: todos seguem para o endereço com o nome do bar
 * (`/bar/$slug`) com 301. O jogo de origem (`?eventId=`) vira `?jogo=`.
 */
export const Route = createFileRoute('/(pub)/pub/$pubId')({
  beforeLoad: async ({ params, search }) => {
    const path = await getBarPathById({ data: params.pubId })
    if (!path) throw notFound()
    const eventId = (search as Record<string, unknown>).eventId
    throw redirect({
      href:
        typeof eventId === 'string'
          ? `${path}?jogo=${encodeURIComponent(eventId)}`
          : path,
      statusCode: 301
    })
  }
})
