/**
 * Registro estruturado de requisições (ESC-18).
 *
 * Antes não havia nada do lado do servidor: sem rastreamento de erro, sem
 * medição de duração, sem log estruturado. Quando algo degradasse em
 * produção, não haveria por onde começar — e vários achados desta auditoria
 * teriam sido percebidos por medição, não por leitura de código.
 *
 * Uma linha JSON por chamada, com o que permite investigar: qual
 * procedimento, quanto demorou, se falhou e por quê. O que NÃO entra é tão
 * importante quanto: nada de entrada do usuário, nada de identificador de
 * pessoa. `waitlist.join` carrega e-mail e telefone; `pub.updateMe` carrega
 * endereço. Log não é lugar para isso, e uma vez gravado não se desgrava.
 */

/** Acima disto, a chamada é marcada como lenta e merece investigação. */
export const LIMITE_LENTIDAO_MS = 500

export type ResultadoChamada = {
  path: string
  type: 'query' | 'mutation' | 'subscription'
  durationMs: number
  ok: boolean
  /** Código do erro do tRPC, quando houve. Nunca a mensagem: ela pode
   *  carregar dado que veio da entrada. */
  errorCode?: string
}

export type LinhaDeLog = {
  evt: 'trpc'
  path: string
  type: string
  ms: number
  ok: boolean
  slow: boolean
  code?: string
}

/**
 * Monta a linha de log. Função pura de propósito: é o ponto onde se decide o
 * que sai, e isso precisa ser testável sem servidor.
 */
export function montarLinhaDeLog(resultado: ResultadoChamada): LinhaDeLog {
  const linha: LinhaDeLog = {
    evt: 'trpc',
    path: resultado.path,
    type: resultado.type,
    // Arredondado: fração de milissegundo não ajuda em nada e polui a busca.
    ms: Math.round(resultado.durationMs),
    ok: resultado.ok,
    slow: resultado.durationMs >= LIMITE_LENTIDAO_MS
  }
  if (resultado.errorCode) linha.code = resultado.errorCode
  return linha
}

/**
 * Erro esperado — recusa de negócio — ou defeito?
 *
 * A distinção existe para que o volume normal de `UNAUTHORIZED` e
 * `BAD_REQUEST` não afogue os defeitos reais no mesmo nível de severidade.
 */
const CODIGOS_ESPERADOS = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'BAD_REQUEST',
  'CONFLICT',
  'TOO_MANY_REQUESTS'
])

export function nivelDoLog(
  resultado: ResultadoChamada
): 'info' | 'warn' | 'error' {
  if (resultado.ok) {
    return resultado.durationMs >= LIMITE_LENTIDAO_MS ? 'warn' : 'info'
  }
  if (resultado.errorCode && CODIGOS_ESPERADOS.has(resultado.errorCode)) {
    return 'warn'
  }
  return 'error'
}
