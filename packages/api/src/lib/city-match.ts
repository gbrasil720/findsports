/**
 * Comparação de nome de cidade (ESC-19).
 *
 * A lista de cidades liberadas é digitada por uma pessoa no painel interno; o
 * nome da cidade do bar é digitado por outra pessoa no onboarding. Comparar
 * as duas string por igualdade exata reprovaria "sao paulo" contra
 * "São Paulo" e, pior, "São  Paulo" com dois espaços contra ele mesmo.
 *
 * A normalização é deliberadamente conservadora: caixa, acento e espaço
 * repetido. Nada de apelido, abreviação ou correção por proximidade — um
 * bloqueio de lançamento que erra por "quase igual" é pior do que um que
 * exige o nome certo, porque ninguém consegue explicar por que passou.
 */

export function normalizarCidade(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lista vazia significa "todas liberadas" — é o padrão da flag e o
 * comportamento anterior a ela. Só uma lista preenchida restringe.
 */
export function cidadeLiberada(cidade: string, liberadas: string[]): boolean {
  if (liberadas.length === 0) return true
  const alvo = normalizarCidade(cidade)
  if (alvo.length === 0) return false
  return liberadas.some((liberada) => normalizarCidade(liberada) === alvo)
}
