/**
 * Como cada papel é chamado na tela — um lugar só.
 *
 * O mesmo público aparecia como "Bar / Pub" na tabela, "Bares / Pubs" no
 * cartão de contagem e "Conta de bar" no cabeçalho de onboarding. Três nomes
 * para a mesma coisa, na mesma sessão de uso, obrigam quem lê a decidir se
 * são a mesma coisa.
 *
 * O nome curto é o singular; o plural existe só para contagens; `account` é
 * como a própria pessoa é chamada quando o texto fala com ela.
 */

export type AppRole = 'fan' | 'pub' | 'admin'

type RoleNames = {
  singular: string
  plural: string
  account: string
}

const ROLE_NAMES: Record<AppRole, RoleNames> = {
  fan: {
    singular: 'Torcedor',
    plural: 'Torcedores',
    account: 'Conta de torcedor'
  },
  pub: { singular: 'Bar', plural: 'Bares', account: 'Conta de bar' },
  admin: { singular: 'Admin', plural: 'Admins', account: 'Conta interna' }
}

function names(role: string): RoleNames | null {
  return role in ROLE_NAMES ? ROLE_NAMES[role as AppRole] : null
}

/** Rótulo curto, para célula de tabela, badge e item de select. */
export function roleLabel(role: string): string {
  return names(role)?.singular ?? role
}

/** Rótulo de contagem: "Bares", "Torcedores". */
export function rolePluralLabel(role: string): string {
  return names(role)?.plural ?? role
}

/** Como o texto chama a conta de quem está lendo. */
export function roleAccountLabel(role: string): string {
  return names(role)?.account ?? role
}
