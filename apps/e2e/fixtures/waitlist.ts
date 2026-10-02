import { randomUUID } from 'node:crypto'
import { type APIRequestContext, expect, request } from '@playwright/test'
import { BASE_URL } from '../env'
import { storageState } from './auth'
import { query } from './db'
import { lastEmailTo } from './email'

/** E-mail único por teste: outbox e rate limit por e-mail não se misturam. */
export function waitlistEmail(prefix = 'waitlist') {
  return `${prefix}-${randomUUID()}@e2e.test`
}

/**
 * Mutation de admin da waitlist (`waitlist.invite`, `waitlist.setApproval`)
 * com a sessão pronta de admin. Só lê a conta do admin, então roda em
 * paralelo. O painel `/internal/waitlist` em si é do WEB-181.
 */
export async function adminWaitlist(
  procedure: 'invite' | 'setApproval',
  input: Record<string, unknown>
) {
  const admin = await request.newContext({
    baseURL: BASE_URL,
    storageState: storageState('admin')
  })
  const response = await admin.post(`/api/trpc/waitlist.${procedure}`, {
    data: input
  })
  expect(response.ok(), await response.text()).toBe(true)
  await admin.dispose()
}

export const SUBJECT = {
  confirm: 'Confirme sua entrada na waitlist da Onside',
  joined: 'Você está na waitlist da Onside',
  invite: 'Seu convite para testar a Onside chegou',
  approvedExisting: 'Seu acesso à Onside foi liberado'
} as const

type JoinInput =
  | { role: 'fan'; email: string; city?: string }
  | { role: 'pub'; email: string; city?: string; pubName?: string }

/**
 * `waitlist.join` pela API, como o formulário da landing manda. Use `page.request`
 * para herdar o IP próprio do teste (rate limit da waitlist conta por IP).
 */
export async function joinWaitlist(api: APIRequestContext, input: JoinInput) {
  const response = await api.post('/api/trpc/waitlist.join', {
    data: {
      city: 'São Paulo',
      ...(input.role === 'pub' ? { pubName: 'Bar E2E' } : {}),
      ...input
    }
  })
  expect(response.ok(), await response.text()).toBe(true)
}

/** Inscreve e confirma pelo link do outbox; devolve o link de saída. */
export async function joinAndConfirm(api: APIRequestContext, input: JoinInput) {
  await joinWaitlist(api, input)
  const { link } = await lastEmailTo(input.email, { subject: SUBJECT.confirm })
  const response = await api.post('/api/trpc/waitlist.confirm', {
    data: { token: new URL(link).searchParams.get('token') }
  })
  expect(response.ok(), await response.text()).toBe(true)
  return (await lastEmailTo(input.email, { subject: SUBJECT.joined })).link
}

export type WaitlistRow = {
  role: 'fan' | 'pub'
  city: string
  pub_name: string | null
  confirmed_at: Date | null
  cancelled_at: Date | null
  approved_at: Date | null
  activated_at: Date | null
  joined_sent_at: Date | null
}

export async function waitlistRow(email: string) {
  const [row] = await query<WaitlistRow>(
    'SELECT * FROM waitlist_entries WHERE email = $1',
    [email]
  )
  return row
}
