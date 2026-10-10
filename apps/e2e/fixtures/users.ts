import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { insert } from './db'

export type Role = 'fan' | 'pub' | 'admin'

export const DEFAULT_PASSWORD = 'senha-e2e-123'

export type UserOptions = {
  role?: Role
  email?: string
  name?: string
  password?: string
  /** Padrão true. Falso: login recusado até verificar pelo outbox. */
  emailVerified?: boolean
  /** Padrão true. Falso: guarda força /onboarding/{papel}. */
  onboardingCompleted?: boolean
}

export type TestUser = {
  id: string
  email: string
  password: string
  name: string
  role: Role
}

/**
 * Usuário com conta de senha, direto no banco. Admin só existe assim: o
 * cadastro não aceita esse papel. E-mail único por chamada,
 * então testes paralelos não colidem.
 */
export async function createUser(options: UserOptions = {}): Promise<TestUser> {
  const id = randomUUID()
  const role = options.role ?? 'fan'
  const user: TestUser = {
    id,
    role,
    email: options.email ?? `${role}-${id}@e2e.test`,
    name: options.name ?? `E2E ${role}`,
    password: options.password ?? DEFAULT_PASSWORD
  }

  await insert('user', {
    id,
    name: user.name,
    email: user.email,
    email_verified: options.emailVerified ?? true,
    role,
    onboarding_completed: options.onboardingCompleted ?? true
  })
  await insert('account', {
    id: randomUUID(),
    account_id: id,
    provider_id: 'credential',
    user_id: id,
    password: await hashPassword(user.password),
    updated_at: new Date()
  })
  return user
}
