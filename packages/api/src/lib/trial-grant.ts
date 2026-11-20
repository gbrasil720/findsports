import { emailBudgetHash } from '@findsports_oficial/auth/email-budget'
import { and, db, eq, sql } from '@findsports_oficial/db'
import { trialGrant } from '@findsports_oficial/db/schema/platform'

type Executor = Pick<typeof db, 'select' | 'insert'>

const GMAIL = new Set(['gmail.com', 'googlemail.com'])

/**
 * O mesmo endereço de caixa: minúsculas, sem `+etiqueta` e, no Gmail, sem os
 * pontos do nome (o Gmail entrega `a.b+x@gmail.com` em `ab@gmail.com`).
 */
export function normalizeTrialEmail(email: string): string {
  const raw = email.trim().toLowerCase()
  const at = raw.lastIndexOf('@')
  if (at < 1) return raw
  let local = raw.slice(0, at).split('+')[0] ?? ''
  let domain = raw.slice(at + 1)
  if (GMAIL.has(domain)) {
    local = local.replaceAll('.', '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

// ponytail: sem abreviações ("r." × "rua"); só sinal para o Houdini, nada bloqueia.
const squash = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Rua e número (o campo `address`), cidade e UF, sem acento nem pontuação. */
export function normalizeTrialAddress(input: {
  address: string
  city: string
  uf?: string | null
}): string {
  return [input.address, input.city, input.uf ?? ''].map(squash).join('|')
}

export const trialEmailHash = (email: string) =>
  emailBudgetHash('trial-email', normalizeTrialEmail(email))

export const trialAddressHash = (
  input: Parameters<typeof normalizeTrialAddress>[0]
) => emailBudgetHash('trial-address', normalizeTrialAddress(input))

/** Este e-mail já ganhou o teste do cadastro, nesta conta ou numa excluída. */
export async function trialAlreadyGranted(
  emailHash: string,
  executor: Executor = db
): Promise<boolean> {
  const [row] = await executor
    .select({ id: trialGrant.id })
    .from(trialGrant)
    .where(
      and(eq(trialGrant.emailHash, emailHash), eq(trialGrant.granted, true))
    )
    .limit(1)
  return Boolean(row)
}

/**
 * O que a ficha do Houdini mostra: o bar foi ao ar sem teste (e o admin pode
 * liberar) e o endereço bate com o de um cadastro anterior.
 */
export async function readTrialSignals(barId: string) {
  const [own] = await db
    .select({
      granted: trialGrant.granted,
      // Linha de bar excluído tem `bar_id` nulo: daí o `IS DISTINCT FROM`. A
      // coluna de fora vai qualificada à mão: o Drizzle a escreveria sem tabela.
      sameAddress: sql<boolean>`EXISTS (
        SELECT 1 FROM trial_grant o
        WHERE o.address_hash = trial_grant.address_hash
          AND o.created_at < trial_grant.created_at
          AND o.bar_id IS DISTINCT FROM trial_grant.bar_id
      )`
    })
    .from(trialGrant)
    .where(eq(trialGrant.barId, barId))
    .limit(1)
  return {
    deniedTrial: own ? !own.granted : false,
    sameAddress: own?.sameAddress ?? false
  }
}
