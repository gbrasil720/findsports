import { getErrorStatus } from '@findsports_oficial/api/lib/transient-error'

/*
 * O papel da conta (torcedor ou bar) quando o servidor não responde
 * (WEB-538). Puro: o teste roda sem o cliente do better-auth.
 *
 * O papel só vem do servidor, na sessão. Na conta sem dados
 * (`accountWithoutData`, `lib/stored-session.ts`) não há sessão: vale o
 * papel da última sessão boa, guardado no aparelho. Sem papel guardado
 * (instalação de antes da regra que nunca leu a sessão depois de atualizar)
 * o app não chuta: nenhuma tela de torcedor nem de bar, só a abertura com o
 * "Sinal caiu" até a sessão chegar.
 */

export type AccountKind = 'fan' | 'pub'

const isKind = (role: unknown): role is AccountKind =>
  role === 'fan' || role === 'pub'

/** Torcedor, bar, ou nenhum dos dois (visitante, ou papel desconhecido). */
export function accountKind(
  sessionRole: unknown,
  storedRole: string | null,
  withoutData: boolean
): AccountKind | null {
  if (isKind(sessionRole)) return sessionRole
  return withoutData && isKind(storedRole) ? storedRole : null
}

type SessionState = {
  data: { user?: { role?: unknown } } | null
  error: unknown
  isPending: boolean
  isRefetching?: boolean
}

/**
 * O que gravar no aparelho a cada mudança da sessão: o papel (sessão boa),
 * `null` para apagar (o servidor tirou da conta: 401, ou 200 sem sessão) ou
 * `undefined` para deixar como está (lendo, ou falha sem resposta).
 */
export function roleToStore(
  state: SessionState
): AccountKind | null | undefined {
  if (state.data) {
    const role = state.data.user?.role
    return isKind(role) ? role : null
  }
  if (state.isPending || state.isRefetching) return undefined
  if (!state.error || getErrorStatus(state.error) === 401) return null
  return undefined
}

// Telas do dono do bar, fora do grupo `(bar)`.
const OWNER = new Set([
  '(bar)',
  'validar-codigo',
  'quem-vai',
  'comanda',
  'desempenho',
  'meu-espaco',
  'fotos-do-bar',
  'plano',
  'configuracoes-bar',
  'cadastro-bar',
  'jogo-no-ar',
  'completar-perfil',
  'rotina',
  'plano-do-teste',
  'perfil-completo',
  'novo-jogo'
])

// Telas dos dois papéis (a página do bar, a conta, o que é avulso) e as de
// entrar. O resto é do torcedor: tela nova cai lá sem ninguém lembrar.
const SHARED = new Set([
  'bar',
  'foto',
  'fotos',
  'configuracoes',
  'senha',
  'duas-etapas',
  'aparelhos',
  'legal',
  '+not-found',
  'dev',
  'manutencao',
  'entrar',
  'sign-in',
  'sign-up',
  'profile',
  'verify-email',
  'forgot-password',
  'reset-sent',
  'two-factor',
  'verified'
])

/**
 * A conta sem dados abriu (link direto, recarga) uma tela que não é do papel
 * dela? Ela volta à abertura, que mostra o "Sinal caiu" e leva à área certa
 * quando a sessão chegar. `segment` é o primeiro de `useSegments()`.
 */
export function leavesRoute(
  kind: AccountKind | null,
  withoutData: boolean,
  segment: string | undefined
): boolean {
  if (!withoutData || !segment || SHARED.has(segment)) return false
  return (OWNER.has(segment) ? 'pub' : 'fan') !== kind
}
