/*
 * "Ver sem login, agir com login" (dono, 05/11/2026): a ação que pediu login
 * viaja como `?acao=<tipo>.<id>` pelo cadastro, pela confirmação do e-mail,
 * pelo 2FA e pelo onboarding (`callbackUrl`), e a tela que a recebe com
 * sessão a conclui uma vez (`TorcedorShell`). Pela folha de entrar ela nem
 * sai da página. A página do bar usa o mesmo formato.
 */

export type TipoAcao = 'vou' | 'fav' | 'lembrar'
/** `app`: entrar na lista do "Me avise quando o app chegar", sem id. */
export type Acao = { tipo: TipoAcao; id: string } | { tipo: 'app' }

const TIPOS: readonly TipoAcao[] = ['vou', 'fav', 'lembrar']
const UUID = /^[0-9a-f-]{36}$/i

export function acaoTexto(acao: Acao): string {
  return acao.tipo === 'app' ? 'app' : `${acao.tipo}.${acao.id}`
}

export function lerAcao(texto: unknown): Acao | null {
  if (typeof texto !== 'string') return null
  if (texto === 'app') return { tipo: 'app' }
  const [tipo, id] = texto.split('.')
  if (!TIPOS.includes(tipo as TipoAcao) || !id || !UUID.test(id)) return null
  return { tipo: tipo as TipoAcao, id }
}

/** O endereço `href` (caminho + query) com a ação na query. */
export function comAcao(href: string, acao: Acao | undefined): string {
  if (!acao) return href
  const url = new URL(href, 'http://local')
  url.searchParams.set('acao', acaoTexto(acao))
  return url.pathname + url.search
}

/** O endereço sem a `acao`, para depois de concluída. */
export function semAcao(href: string): string {
  const url = new URL(href, 'http://local')
  url.searchParams.delete('acao')
  return url.pathname + url.search + url.hash
}
