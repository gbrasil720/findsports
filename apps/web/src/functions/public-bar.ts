import {
  readNearbyGamesToday,
  readPublicBarPage,
  resolveBarRef
} from '@findsports_oficial/api/lib/public-bar-page'
import { db, eq } from '@findsports_oficial/db'
import { barPath, parseBarRef } from '@findsports_oficial/db/bar-slug'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createServerFn } from '@tanstack/react-start'

import { authMiddleware } from '@/middleware/auth'

/**
 * A página pública do bar (`/bar/$slug`), lida no servidor para sair no HTML
 * que o Google e a prévia do WhatsApp leem. A sessão só serve para o dono
 * continuar vendo a prévia do bar fora do ar; o que é de quem olha (presença,
 * amigos, salvo) vem depois, no cliente, por `pubs.pageViewer`.
 *
 * `null`: link sem bar (prefixo inválido, inexistente ou repetido), 404.
 */
export const getPublicBar = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((slug: string) => String(slug).slice(0, 200))
  .handler(async ({ data: slug, context }) => {
    const ref = parseBarRef(slug)
    const id = ref ? await resolveBarRef(ref) : null
    if (!id) return null
    const now = new Date()
    const page = await readPublicBarPage(id, {
      now,
      viewerId: context.session?.user.id ?? null
    })
    if (!page) return null
    // Sem jogo marcado: os bares com jogo hoje perto daqui (estado 3).
    const nearby =
      page.kind === 'live' && page.bar.events.length === 0
        ? await readNearbyGamesToday(id, now)
        : []
    return { ...page, nearby, now }
  })

/**
 * O endereço novo de um link antigo (`/pub/<id>`, o do QR e do WhatsApp).
 * `null`: o id não é de bar nenhum.
 */
export const getBarPathById = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => String(id).slice(0, 64))
  .handler(async ({ data: id }) => {
    const row = await db.query.bar.findFirst({
      where: eq(bar.id, id),
      columns: { id: true, name: true, neighborhood: true }
    })
    return row ? barPath(row) : null
  })
