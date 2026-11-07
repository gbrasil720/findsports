/*
 * "Ver sem login, agir com login" (dono, 05/11/2026): a ação que pediu login
 * viaja como `?acao=<tipo>.<id>` pelo cadastro, pela confirmação do e-mail,
 * pelo 2FA e pelo onboarding (`callbackUrl`), e a tela que a recebe com
 * sessão a conclui uma vez: a casca do torcedor (`TorcedorShell`) e a página
 * do bar (`BarPage`). Pela folha de entrar ela nem sai da página.
 *
 * Formato único para as duas. A página do bar mandava antes `?acao=vou`
 * (com o jogo em `?jogo=`) e `?acao=salvar` (o bar é o da página); links e
 * e-mails já mandados com ele continuam valendo pelo `legado` de `lerAcao`.
 */

export type TipoAcao = 'vou' | 'fav' | 'lembrar'
/** `app`: entrar na lista do "Me avise quando o app chegar", sem id. */
export type Acao = { tipo: TipoAcao; id: string } | { tipo: 'app' }

const TIPOS: readonly TipoAcao[] = ['vou', 'fav', 'lembrar']
const UUID = /^[0-9a-f-]{36}$/i

export function acaoTexto(acao: Acao): string {
  return acao.tipo === 'app' ? 'app' : `${acao.tipo}.${acao.id}`
}

/**
 * Lê `?acao=`. `legado` é o contexto da página do bar, para o formato antigo
 * sem id: o bar da página (`salvar`) e o jogo do cartão (`vou`).
 */
export function lerAcao(
  texto: unknown,
  legado?: { barId?: string; eventId?: string }
): Acao | null {
  if (typeof texto !== 'string') return null
  if (texto === 'app') return { tipo: 'app' }
  if (texto === 'salvar' && legado?.barId)
    return { tipo: 'fav', id: legado.barId }
  if (texto === 'vou' && legado?.eventId)
    return { tipo: 'vou', id: legado.eventId }
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

/** Se o endereço leva uma ação, para não perdê-la num redirecionamento. */
export function temAcao(href: string): boolean {
  return new URL(href, 'http://local').searchParams.has('acao')
}
