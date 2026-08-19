import { db, sql } from '@findsports_oficial/db'

/**
 * Portão de entrada pela lista de espera (ESC-19).
 *
 * A plataforma abre por convite. Quem decide é `waitlist_entries.approved_at`,
 * preenchido por um admin no painel interno — nunca a simples existência da
 * linha, que qualquer pessoa cria pelo formulário público.
 *
 * ## Onde ele fica, e por quê
 *
 * No handler que despacha para o `better-auth`, o mesmo ponto onde o checkout
 * é barrado. Não é preguiça de arquitetura: `packages/auth` não pode importar
 * `packages/api` — a dependência corre no sentido oposto — e é em
 * `packages/api` que vive a configuração em tempo de execução. O handler é o
 * único lugar que enxerga os dois, e é por onde a requisição passa de
 * qualquer forma, inclusive quando alguém chama o endpoint sem passar pela
 * tela.
 *
 * ## A trava contra se trancar do lado de fora
 *
 * Administrador NUNCA é barrado no login. Se fosse, ligar o portão sem querer
 * — ou aprovar a lista errada — deixaria o painel que desliga o portão do
 * outro lado da porta trancada. Essa isenção é a razão de o interruptor poder
 * existir; sem ela ele seria uma armadilha.
 *
 * Cadastro não tem isenção: `role` no cadastro é limitado a `fan`/`pub` pelo
 * plugin de auth, então não há admin nascendo por ali.
 */

const CAMINHO_CADASTRO = '/sign-up/email'
const CAMINHO_LOGIN = '/sign-in/email'

export type AcaoDeEntrada = 'signup' | 'signin'

export type PortaoWaitlist = {
  signup: boolean
  signin: boolean
}

export function acaoDeEntrada(url: string): AcaoDeEntrada | null {
  let caminho: string
  try {
    caminho = new URL(url).pathname
  } catch {
    caminho = url.split('?')[0] ?? ''
  }

  const normalizado = caminho.toLowerCase().replace(/\/+$/, '')
  if (normalizado.endsWith(CAMINHO_CADASTRO)) return 'signup'
  if (normalizado.endsWith(CAMINHO_LOGIN)) return 'signin'
  return null
}

export type ContextoDeEntrada = {
  acao: AcaoDeEntrada
  portao: PortaoWaitlist
  /** Há linha aprovada na lista de espera para este e-mail. */
  aprovado: boolean
  /** Papel da conta que já existe com este e-mail, quando existe. */
  papelExistente: string | null
}

export type DecisaoDeEntrada =
  | { permitido: true }
  | { permitido: false; motivo: string }

const MOTIVO_CADASTRO =
  'A Onside ainda está abrindo por convite. Entre na lista de espera — avisamos assim que liberarmos seu acesso.'
const MOTIVO_LOGIN =
  'Seu acesso ainda não foi liberado. Avisamos por e-mail assim que a sua vez chegar.'

export function decidirEntrada(ctx: ContextoDeEntrada): DecisaoDeEntrada {
  // Antes de qualquer outra coisa: admin entra sempre. Ver o comentário do
  // topo — é o que impede o interruptor de trancar quem o desliga.
  if (ctx.acao === 'signin' && ctx.papelExistente === 'admin') {
    return { permitido: true }
  }

  const ligado = ctx.acao === 'signup' ? ctx.portao.signup : ctx.portao.signin
  if (!ligado) return { permitido: true }
  if (ctx.aprovado) return { permitido: true }

  return {
    permitido: false,
    motivo: ctx.acao === 'signup' ? MOTIVO_CADASTRO : MOTIVO_LOGIN
  }
}

/**
 * Extrai o e-mail do corpo da requisição de auth.
 *
 * O corpo só pode ser lido uma vez, então quem chama precisa passar um clone
 * — a requisição original ainda vai para o `better-auth`. Corpo inválido
 * devolve `null`: o portão não é o lugar de validar formato, e o
 * `better-auth` recusa sozinho logo depois.
 *
 * O parâmetro pede só `json()`, e não `Request`, porque é só o que a função
 * usa — e porque `Request` tem duas declarações em conflito neste monorepo
 * (a do DOM e a do `undici`), que brigariam sem acrescentar garantia nenhuma.
 */
export async function emailDaRequisicao(clone: {
  json(): Promise<unknown>
}): Promise<string | null> {
  try {
    const corpo: unknown = await clone.json()
    if (typeof corpo !== 'object' || corpo === null) return null
    const email = (corpo as { email?: unknown }).email
    if (typeof email !== 'string') return null
    const normalizado = email.trim().toLowerCase()
    return normalizado.length > 0 ? normalizado : null
  } catch {
    return null
  }
}

/**
 * Consulta as duas coisas que a decisão precisa, numa ida só ao banco.
 *
 * Duas consultas seriam duas viagens no caminho de login, que é o mais
 * sensível a latência do produto — e a resposta é uma linha com dois
 * booleanos.
 */
export async function consultarEntrada(email: string): Promise<{
  aprovado: boolean
  papelExistente: string | null
}> {
  const resultado = await db.execute(sql`
    SELECT
      EXISTS (
        SELECT 1 FROM waitlist_entries
        WHERE email = ${email} AND approved_at IS NOT NULL
      ) AS aprovado,
      (SELECT role FROM "user" WHERE email = ${email} LIMIT 1) AS papel
  `)
  const linha = resultado.rows[0] as
    | { aprovado: boolean; papel: string | null }
    | undefined

  return {
    aprovado: linha?.aprovado === true,
    papelExistente: linha?.papel ?? null
  }
}

/**
 * 403 e não 503: a porta não está fechada para todos, está fechada para este
 * e-mail. O `message` segue o formato que o cliente do better-auth lê, para a
 * tela mostrar o texto certo sem tratamento especial.
 */
export function respostaPortaoFechado(motivo: string): Response {
  return new Response(
    JSON.stringify({ message: motivo, code: 'WAITLIST_NOT_APPROVED' }),
    {
      status: 403,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    }
  )
}
