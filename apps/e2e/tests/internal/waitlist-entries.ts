import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { insert, query } from '../../fixtures/db'

export type WaitlistEntry = { id: string; email: string; role: 'fan' | 'pub' }

/**
 * Inscrição já confirmada, pronta para o admin aprovar. `tag` entra no e-mail
 * para a busca do painel isolar as linhas do teste das dos outros workers.
 */
export async function createWaitlistEntry(
  tag: string,
  options: {
    role?: 'fan' | 'pub'
    pubName?: string
    confirmed?: boolean
  } = {}
): Promise<WaitlistEntry> {
  const id = randomUUID()
  const role = options.role ?? 'fan'
  const email = `${tag}-${role}-${id.slice(0, 8)}@e2e.test`
  await insert('waitlist_entries', {
    id,
    email,
    role,
    city: 'São Paulo',
    pub_name: role === 'pub' ? (options.pubName ?? `Bar ${tag}`) : null,
    confirmed_at: (options.confirmed ?? true) ? new Date() : null
  })
  return { id, email, role }
}

export async function waitlistRow(email: string) {
  const [row] = await query<{
    approved_at: Date | null
    invite_sent_at: Date | null
    role: string
  }>(
    'SELECT approved_at, invite_sent_at, role FROM waitlist_entries WHERE email = $1',
    [email]
  )
  return row
}

/** Linha da tabela (desktop) ou cartão (mobile) de uma inscrição. */
export function entryRow(page: Page, email: string) {
  return page.locator('tr, li').filter({ hasText: email })
}

/** Prefixo único por teste, para a busca do painel. */
export const uniqueTag = (prefix: string) =>
  `${prefix}-${randomUUID().slice(0, 8)}`
