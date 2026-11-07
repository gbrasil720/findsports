import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { getBarPathById } from '@/functions/public-bar'

/**
 * Endereço antigo da página do bar. Os links já mandados no WhatsApp, o QR e
 * o "Compartilhar" do app (`apps/mobile/app/bar/[id].tsx`), o painel e o
 * Houdini usam `/pub/<id>`: todos seguem para o endereço com o nome do bar
 * (`/bar/$slug`) com 301. O jogo de origem (`?eventId=`) vira `?jogo=`, e a
 * `?acao=` vai junto.
 */
export const Route = createFileRoute('/(pub)/pub/$pubId')({
  beforeLoad: async ({ params, search }) => {
    const path = await getBarPathById({ data: params.pubId })
    if (!path) throw notFound()
    const { eventId, acao } = search as Record<string, unknown>
    const query = new URLSearchParams()
    if (typeof eventId === 'string') query.set('jogo', eventId)
    // A ação pedida antes de entrar (`torcedor/acao.ts`) segue junto.
    if (typeof acao === 'string') query.set('acao', acao)
    throw redirect({
      href: query.size ? `${path}?${query}` : path,
      statusCode: 301
    })
  }
})
