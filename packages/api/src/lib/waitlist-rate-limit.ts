/**
 * Limite compartilhado da waitlist pública.
 *
 * Sem CAPTCHA por enquanto: o freio é por IP e por e-mail normalizado, com
 * janela fixa. Cabe em humano preenchendo o form; corta o ~74 inserts/s do
 * teste de carga.
 *
 * ESC-19: os números deixaram de ser constante de módulo e passaram a chegar
 * por parâmetro, alimentados pela configuração em tempo de execução. O motivo
 * é o risco conhecido do freio por IP — faculdade, empresa e operadora
 * compartilham endereço, e num dia de lançamento o teto acaba antes de a
 * carga acabar. Afrouxar precisava ser mudança de dado, não de código.
 */

export type JanelaLimite = {
  max: number
  windowMs: number
}

export type LimitesWaitlist = {
  enabled: boolean
  ip: JanelaLimite
  email: JanelaLimite
}

/**
 * Valores medidos. Continuam vivendo aqui, ao lado do raciocínio que os
 * produziu; o registro de configuração importa daqui em vez de repetir os
 * números, para que só exista um lugar onde eles mudam de verdade.
 */
export const WAITLIST_LIMITES_PADRAO: LimitesWaitlist = {
  enabled: true,
  ip: { max: 8, windowMs: 10 * 60_000 },
  email: { max: 3, windowMs: 10 * 60_000 }
}

export type DecisaoRateLimit = {
  allowed: boolean
  retryAfterMs: number
  count: number
}

export function decidirJanela(args: {
  count: number
  lastRequest: number
  now: number
  max: number
  windowMs: number
}): { nextCount: number; nextLastRequest: number } & DecisaoRateLimit {
  const janelaExpirou = args.now - args.lastRequest >= args.windowMs
  const nextCount = janelaExpirou ? 1 : args.count + 1
  const nextLastRequest = janelaExpirou ? args.now : args.lastRequest
  const allowed = nextCount <= args.max
  const retryAfterMs = allowed
    ? 0
    : Math.max(0, args.windowMs - (args.now - nextLastRequest))
  return { nextCount, nextLastRequest, allowed, retryAfterMs, count: nextCount }
}

/**
 * A janela vai junto da chave. Antes o incrementador deduzia o limite pelo
 * prefixo da chave, o que espalhava a regra por dois arquivos — quem trocasse
 * o prefixo aqui aplicaria o limite errado lá, sem nenhum aviso.
 */
export type Incremento = (
  key: string,
  janela: JanelaLimite
) => Promise<DecisaoRateLimit>

const LIBERADO: DecisaoRateLimit = {
  allowed: true,
  retryAfterMs: 0,
  count: 0
}

export async function consumirLimitesWaitlist(args: {
  ip: string
  email: string
  limites: LimitesWaitlist
  incrementar: Incremento
}): Promise<DecisaoRateLimit> {
  // Desligado não é "limite infinito": é não escrever na tabela `rate_limit`
  // de jeito nenhum. O caso em que se desliga isto é justamente aquele em que
  // a escrita do contador é o gargalo.
  if (!args.limites.enabled) return LIBERADO

  const email = args.email.trim().toLowerCase()
  const porEmail = await args.incrementar(
    `waitlist:email:${email}`,
    args.limites.email
  )
  if (!porEmail.allowed) return porEmail

  if (!args.ip || args.ip === 'unknown') return porEmail

  const porIp = await args.incrementar(
    `waitlist:ip:${args.ip}`,
    args.limites.ip
  )
  if (!porIp.allowed) return porIp
  return porIp
}
