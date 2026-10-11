/**
 * Comparação de nome de cidade.
 *
 * O nome digitado por uma pessoa é comparado com o de uma lista (municípios do
 * IBGE, estados, resposta do geocoding). Igualdade exata reprovaria
 * "sao paulo" contra "São Paulo" e, pior, "São  Paulo" com dois espaços
 * contra ele mesmo.
 *
 * A normalização é deliberadamente conservadora: caixa, acento e espaço
 * repetido. Nada de apelido, abreviação ou correção por proximidade.
 */

export function normalizarCidade(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
