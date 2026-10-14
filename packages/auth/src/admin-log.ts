import { db, eq } from '@findsports_oficial/db'
import {
  type AdminActionEntry,
  recordAdminActionSafely
} from '@findsports_oficial/db/admin-action'
import { user } from '@findsports_oficial/db/schema/auth'

/**
 * WEB-384: as ações do plugin admin do better-auth vão para o Grimório.
 * Grava no servidor, depois que a rota respondeu sem erro: o cliente não
 * consegue pular o registro nem escrever um falso.
 */

export const LOGGED_ADMIN_PATHS = [
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/ban-user',
  '/admin/unban-user',
  '/admin/set-role'
] as const

type LoggedPath = (typeof LOGGED_ADMIN_PATHS)[number]

export function isLoggedAdminPath(
  path: string | undefined
): path is LoggedPath {
  return LOGGED_ADMIN_PATHS.includes(path as LoggedPath)
}

type Body = { userId?: unknown; banReason?: unknown; role?: unknown }

type ActorSession = {
  user: { id: string; name: string; email: string }
  session: { impersonatedBy?: string | null; createdAt: Date }
}

async function personLabel(userId: string) {
  const [row] = await db
    .select({ name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row ?? null
}

/** O papel antes da troca: lido no hook `before`, usado no `after`. */
export async function previousRole(body: Body) {
  if (typeof body.userId !== 'string') return null
  return (await personLabel(body.userId))?.role ?? null
}

/**
 * Monta a linha do Grimório para uma rota do plugin admin, ou `null` quando
 * não há o que registrar. Separada da gravação para ser testável.
 */
export async function adminActionFor({
  path,
  body,
  session,
  roleBefore
}: {
  path: LoggedPath
  body: Body
  session: ActorSession
  roleBefore?: string | null
}): Promise<AdminActionEntry | null> {
  if (path === '/admin/stop-impersonating') {
    // A sessão que pede para parar é a da pele: quem agiu é o admin.
    const actorId = session.session.impersonatedBy
    if (!actorId) return null
    const actor = await personLabel(actorId)
    const seconds = Math.max(
      0,
      Math.round((Date.now() - session.session.createdAt.getTime()) / 1000)
    )
    return {
      kind: 'user.stop_impersonating',
      actorId,
      actorName: actor?.name ?? actorId,
      targetType: 'user',
      targetId: session.user.id,
      targetLabel: session.user.email,
      detail: { seconds }
    }
  }

  if (typeof body.userId !== 'string') return null
  const target = await personLabel(body.userId)
  const base = {
    actorId: session.user.id,
    actorName: session.user.name,
    targetType: 'user',
    targetId: body.userId,
    targetLabel: target?.email ?? body.userId
  }

  switch (path) {
    case '/admin/impersonate-user':
      return { ...base, kind: 'user.impersonate' }
    case '/admin/ban-user':
      return {
        ...base,
        kind: 'user.ban',
        detail:
          typeof body.banReason === 'string' && body.banReason
            ? { reason: body.banReason }
            : null
      }
    case '/admin/unban-user':
      return { ...base, kind: 'user.unban' }
    case '/admin/set-role':
      return {
        ...base,
        kind: 'user.set_role',
        before: roleBefore ? { role: roleBefore } : null,
        after: typeof body.role === 'string' ? { role: body.role } : null
      }
  }
}

export async function logAdminAction(
  input: Parameters<typeof adminActionFor>[0]
) {
  const entry = await adminActionFor(input)
  if (entry) await recordAdminActionSafely(entry)
}
