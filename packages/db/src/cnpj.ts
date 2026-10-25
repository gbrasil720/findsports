/*
 * CNPJ dos dados da nota (WEB-444). Puro: o painel valida e formata com isto,
 * a API recusa o que não passa, e o cliente do Stripe recebe o formatado.
 *
 * Desde julho de 2026 o CNPJ novo pode ter letras nas 12 primeiras posições
 * (IN RFB 2.229/2024); os dois dígitos verificadores continuam números. O
 * cálculo é o mesmo módulo 11 de sempre, com cada caractere valendo o código
 * ASCII menos 48: os números valem o que sempre valeram, então o CNPJ só de
 * números passa pelo mesmo caminho.
 */

const PESOS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

/** Só letras e números, em maiúsculas: "12.345.678/0001-90" → "12345678000190". */
export function normalizeCnpj(value: string) {
  return value.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

function digito(base: string) {
  const pesos = PESOS.slice(PESOS.length - base.length)
  const soma = [...base].reduce(
    (total, char, i) => total + (char.charCodeAt(0) - 48) * (pesos[i] ?? 0),
    0
  )
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** CNPJ com os dígitos verificadores certos, com ou sem pontuação. */
export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false
  // "00.000.000/0000-00" e afins fecham a conta, mas não são CNPJ.
  if (/^(.)\1+$/.test(cnpj)) return false
  const primeiro = digito(cnpj.slice(0, 12))
  const segundo = digito(cnpj.slice(0, 12) + primeiro)
  return cnpj.endsWith(`${primeiro}${segundo}`)
}

/** "12345678000190" → "12.345.678/0001-90". O que não tem 14 caracteres volta como veio. */
export function formatCnpj(value: string) {
  const cnpj = normalizeCnpj(value)
  if (cnpj.length !== 14) return value
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}
