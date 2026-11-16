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

/*
 * A `?acao=` é só um endereço: qualquer um monta um link com ela. Para a ação
 * sair sozinha, este navegador tem de ter começado o login por ela (a folha de
 * entrar, da casca ou da página do bar, a guarda aqui ao abrir). Quem chega
 * com a ação sem esse registro (link de fora, confirmação do e-mail em outro
 * aparelho) vê um cartão de confirmação, e nada grava sem o toque.
 */
const PENDENTE = 'onside.acao-pendente'
/** O cadastro com confirmação de e-mail leva tempo; um dia basta. */
const PENDENTE_MS = 24 * 60 * 60 * 1000

/** A folha de entrar abriu por esta ação: guarda para a volta do login. */
export function guardarAcao(acao: Acao, agora = Date.now()): void {
  try {
    localStorage.setItem(
      PENDENTE,
      JSON.stringify({ texto: acaoTexto(acao), em: agora })
    )
  } catch {}
}

/** Apaga o registro (a ação saiu por outro caminho). */
export function esquecerAcao(): void {
  try {
    localStorage.removeItem(PENDENTE)
  } catch {}
}

/**
 * A ação da URL é a que este navegador guardou ao começar o login? Lê e apaga:
 * vale uma vez. Sem armazenamento (aba privada bloqueada) devolve falso, e a
 * tela pede a confirmação.
 */
export function tomarAcaoPendente(acao: Acao, agora = Date.now()): boolean {
  try {
    const bruto = localStorage.getItem(PENDENTE)
    if (!bruto) return false
    localStorage.removeItem(PENDENTE)
    const { texto, em } = JSON.parse(bruto) as { texto?: unknown; em?: unknown }
    return (
      texto === acaoTexto(acao) &&
      typeof em === 'number' &&
      agora - em >= 0 &&
      agora - em <= PENDENTE_MS
    )
  } catch {
    return false
  }
}

/** A frase do cartão de confirmação, na casca e na página do bar (dono, 16/11/2026). */
export const AVISO_LINK =
  'Este link pede para fazer isso na sua conta. Se não foi você quem pediu, é só ignorar.'

/** A pergunta do cartão de confirmação, quando a ação não foi guardada aqui. */
export const CONFIRMAR: Record<Acao['tipo'], [string, string]> = {
  vou: ['Marcar presença neste jogo?', 'Marcar presença'],
  fav: ['Salvar este bar em Seus bares?', 'Salvar bar'],
  lembrar: ['Lembrar 3 h antes deste jogo?', 'Lembrar'],
  app: ['Entrar na lista do app?', 'Me avise']
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
