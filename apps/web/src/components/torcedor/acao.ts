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

/*
 * Conta nova por uma ação (WEB-501, protótipo `bem-vindo-curto`): a ação vem
 * primeiro e as preferências depois, num card ("Conta criada e…") na tela
 * onde a ação foi parar. O "Me avise do app" não tem tela de ação e segue
 * pelo onboarding de 5 passos, como no protótipo.
 */

/** O card da conta nova: `vouc` é a presença sem código (bar fora do Elite). */
export type Novo = 'vou' | 'vouc' | 'fav' | 'lembrar'

const NOVOS: readonly Novo[] = ['vou', 'vouc', 'fav', 'lembrar']

export function lerNovo(texto: unknown): Novo | null {
  return NOVOS.includes(texto as Novo) ? (texto as Novo) : null
}

/** Torcedor sem onboarding com esta ação no destino pula o onboarding. */
export function acaoPulaOnboarding(href: string): boolean {
  const texto = new URL(href, 'http://local').searchParams.get('acao')
  return Boolean(texto) && texto !== 'app'
}

/** As preferências curtas da conta nova, depois da ação. */
export const BEM_VINDO_PATH = '/dashboard/bem-vindo'

/**
 * Onde a conta nova cai depois da ação concluída, com o card na URL
 * (`?novo=`): o código (bar Elite) ou Meus jogos, Seus bares › Favoritos, e o
 * lembrete, que não tem tela, direto nas preferências curtas.
 */
export function destinoContaNova(
  acao: Exclude<Acao, { tipo: 'app' }>,
  comCodigo = false
): string {
  if (acao.tipo === 'vou')
    return comCodigo
      ? `/dashboard/codigo/${acao.id}?novo=vou`
      : '/dashboard/games?novo=vouc'
  if (acao.tipo === 'fav') return '/dashboard/seus-bares?aba=salvos&novo=fav'
  return `${BEM_VINDO_PATH}?feito=lembrar`
}

/**
 * Conta criada há até um dia: o card diz "Conta criada e…". A de antes, sem
 * onboarding, vê o mesmo card só com a ação ("Bar salvo").
 */
export function contaRecente(
  criadaEm: Date | string | undefined,
  agora = new Date()
): boolean {
  if (!criadaEm) return true
  const ms = agora.getTime() - new Date(criadaEm).getTime()
  return ms <= 24 * 60 * 60 * 1000
}

/** O endereço sem o card da conta nova (`?novo=`). */
export function semNovo(href: string): string {
  const url = new URL(href, 'http://local')
  url.searchParams.delete('novo')
  return url.pathname + url.search + url.hash
}

/**
 * Torcedor sem onboarding pode ficar aqui: com a ação ainda por concluir, com
 * o card da conta nova, ou nas preferências curtas. O resto o leva ao
 * onboarding de 5 passos (`applyAuthGuards`).
 */
export function contaNovaPodeVer(pathname: string, href: string): boolean {
  return (
    pathname === BEM_VINDO_PATH ||
    acaoPulaOnboarding(href) ||
    lerNovo(new URL(href, 'http://local').searchParams.get('novo')) !== null
  )
}
