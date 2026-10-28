import { db } from './index'
import { adminAction } from './schema/houdini'

/** Os truques que o Grimório conhece. Ticket novo do Houdini acrescenta o seu. */
export const ADMIN_ACTION_KINDS = [
  'user.impersonate',
  'user.stop_impersonating',
  'user.impersonation_mode',
  'user.ban',
  'user.unban',
  'user.set_role',
  'user.resend_verification',
  'user.send_password_reset',
  'config.set',
  'config.reset',
  'config.expire',
  'system.run_job',
  'event.update',
  'event.delete',
  'event.fix',
  'bar.sync_search',
  'bar.extend_trial',
  'bar.take_off_air',
  'bar.put_on_air',
  'bar.photo_approve',
  'bar.photo_reject'
] as const

export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number]

export type AdminActionEntry = Omit<
  typeof adminAction.$inferInsert,
  'id' | 'createdAt' | 'kind'
> & { kind: AdminActionKind }

/**
 * Escreve uma linha no Grimório (WEB-384). Quem chama decide se a falha
 * derruba a ação: dentro de transação, a ação e o registro caem juntos; depois
 * de uma ação que já aconteceu (hook do better-auth), `recordAdminActionSafely`.
 */
export async function recordAdminAction(
  entry: AdminActionEntry,
  executor: Pick<typeof db, 'insert'> = db
) {
  await executor.insert(adminAction).values(entry)
}

/** Para depois do fato: a ação já aconteceu, a falha do registro só vai ao log. */
export async function recordAdminActionSafely(entry: AdminActionEntry) {
  try {
    await recordAdminAction(entry)
  } catch (error) {
    console.error(
      JSON.stringify({
        evt: 'admin_action_record_failed',
        kind: entry.kind,
        targetId: entry.targetId,
        message: error instanceof Error ? error.message : String(error)
      })
    )
  }
}
