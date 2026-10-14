import { impersonationModeCookieOptions } from '@findsports_oficial/auth'
import {
  IMPERSONATION_MODE_COOKIE,
  IMPERSONATION_MODES,
  type ImpersonationMode,
  impersonationModeCookieValue
} from '@findsports_oficial/auth/impersonation-mode'
import { db, eq } from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import { user } from '@findsports_oficial/db/schema/auth'
import { createServerFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'

import { authMiddleware } from '@/middleware/auth'

/**
 * WEB-390: troca "Só olhar" / "Pode agir" na faixa da pele. Só vale dentro da
 * pele, e o Grimório registra a troca no nome do admin antes de o cookie sair:
 * sem registro, sem "Pode agir".
 */
export const setImpersonationMode = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((mode: unknown): ImpersonationMode => {
    if (!IMPERSONATION_MODES.includes(mode as ImpersonationMode)) {
      throw new Error('Modo inválido.')
    }
    return mode as ImpersonationMode
  })
  .handler(async ({ context, data: mode }) => {
    const session = context.session
    const actorId = session?.session.impersonatedBy
    if (!session || !actorId)
      throw new Error('Você não está na pele de ninguém.')

    const actor = await db.query.user.findFirst({
      where: eq(user.id, actorId),
      columns: { name: true }
    })
    await recordAdminAction({
      kind: 'user.impersonation_mode',
      actorId,
      actorName: actor?.name ?? actorId,
      targetType: 'user',
      targetId: session.user.id,
      targetLabel: session.user.email,
      after: { mode }
    })

    setCookie(
      IMPERSONATION_MODE_COOKIE,
      impersonationModeCookieValue(session.session.id, mode),
      impersonationModeCookieOptions(new Date(session.session.expiresAt))
    )
    return mode
  })
