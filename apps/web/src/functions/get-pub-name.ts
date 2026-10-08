import { and, db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { createServerFn } from '@tanstack/react-start'

/**
 * Nome do bar para o título e a prévia de link de `/pub/$pubId` (WEB-312).
 *
 * É o único dado de bar que sai sem sessão: quem recebe o link e o robô que
 * monta a prévia não estão logados. Só o nome, só de bar publicado — o resto
 * do perfil continua atrás do login, em `pubs.getById`.
 */
export const getPubName = createServerFn({ method: 'GET' })
  .inputValidator((pubId: string) => String(pubId))
  .handler(async ({ data: pubId }) => {
    const row = await db.query.bar.findFirst({
      where: and(eq(bar.id, pubId), eq(bar.isActive, true)),
      columns: { name: true }
    })
    return row?.name ?? null
  })
