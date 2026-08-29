import { db, sql } from '@findsports_oficial/db'
import { hashPassword } from 'better-auth/crypto'

import { hashWaitlistToken } from './waitlist-workflow'

export class InvalidWaitlistInviteError extends Error {}

export async function activateWaitlistInvite(input: {
  token: string
  name: string
  password: string
}) {
  const tokenHash = await hashWaitlistToken(input.token)
  return db.transaction(async (tx) => {
    const invite = await tx.execute(sql`
      SELECT email, role
      FROM waitlist_entries
      WHERE invite_token_hash = ${tokenHash}
        AND invite_expires_at > NOW()
        AND activated_at IS NULL
        AND approved_at IS NOT NULL
        AND cancelled_at IS NULL
      FOR UPDATE
    `)
    const row = invite.rows[0] as
      | { email: string; role: 'fan' | 'pub' }
      | undefined
    if (!row)
      throw new InvalidWaitlistInviteError('Convite inválido ou expirado.')

    const existing = await tx.execute(sql`
      SELECT id FROM "user" WHERE lower(email) = ${row.email} LIMIT 1
    `)
    if (existing.rows.length > 0) {
      await tx.execute(sql`
        UPDATE "user" SET admitted_at = COALESCE(admitted_at, NOW())
        WHERE lower(email) = ${row.email}
      `)
      await tx.execute(sql`
        UPDATE waitlist_entries SET
          activated_at = NOW(), invite_token_hash = NULL
        WHERE email = ${row.email}
      `)
      return { email: row.email, existingAccount: true }
    }

    const passwordHash = await hashPassword(input.password)
    const userId = crypto.randomUUID()
    await tx.execute(sql`
      INSERT INTO "user"
        (id, name, email, email_verified, role, admitted_at)
      VALUES (${userId}, ${input.name}, ${row.email}, true, ${row.role}, NOW())
    `)
    await tx.execute(sql`
      INSERT INTO account
        (id, account_id, provider_id, user_id, password, created_at, updated_at)
      VALUES (
        ${crypto.randomUUID()}, ${userId}, 'credential', ${userId},
        ${passwordHash}, NOW(), NOW()
      )
    `)
    await tx.execute(sql`
      UPDATE waitlist_entries SET
        activated_at = NOW(), invite_token_hash = NULL
      WHERE email = ${row.email}
    `)
    return { email: row.email, existingAccount: false }
  })
}
