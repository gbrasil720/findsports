/**
 * Cardápio e gasto médio do bar (WEB-39): um link público mantido pelo bar e
 * um valor por pessoa que o próprio bar declara.
 *
 * Vive no pacote do banco pelo mesmo motivo de `house-offer.ts`: os CHECKs das
 * colunas, o procedimento que grava e o formulário do painel precisam dos
 * mesmos limites e da mesma leitura do que foi digitado. Não importa nada do
 * Drizzle para poder ir ao navegador.
 */

/** Teto da URL gravada, contado sobre a forma normalizada. */
export const MENU_URL_MAX_LENGTH = 2048

/**
 * Teto do gasto médio por pessoa: R$ 1.000,00.
 *
 * Provisório — ainda não há definição comercial. É o único lugar do número:
 * o CHECK da coluna, a API e o formulário leem daqui.
 */
export const AVERAGE_SPEND_MAX_CENTS = 100_000

export type MenuUrlResult =
  | { ok: true; url: string | null }
  | { ok: false; error: string }

const INVALID_URL = 'Informe um link válido, como https://…'
const LEADING_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i
// Nome de domínio público: rótulos não vazios e TLD alfabético (ou punycode).
// Recusa IP, `localhost`, ponto sobrando e `www.` sozinho.
const PUBLIC_HOST = /^[a-z\d-]+(?:\.[a-z\d-]+)*\.(?:[a-z]{2,63}|xn--[a-z\d-]+)$/

/**
 * Forma gravada do link do cardápio. Vazio vira `null` — remover o link é
 * mandar o campo em branco.
 *
 * Sem esquema no início, o texto ganha `https://` na frente: quem cola
 * `instagram.com/bar` quer dizer isso. Esquemas como `javascript:` ou
 * `data:` não sobrevivem ao prefixo (viram porta ou usuário inválidos) e, com
 * `://`, caem na checagem de protocolo.
 *
 * `@` antes do domínio é recusado, mesmo sem usuário: `https://banco.com@outro.site`
 * engana quem lê, e um `@boteco.rio` digitado como perfil viraria o site
 * `boteco.rio`. Espaço também: os navegadores não concordam em como tratá-lo.
 */
export function parseMenuUrl(input: string | null | undefined): MenuUrlResult {
  const trimmed = input?.trim() ?? ''
  if (trimmed === '') return { ok: true, url: null }
  if (trimmed.startsWith('@')) {
    return {
      ok: false,
      error: 'Cole o endereço completo do perfil, como instagram.com/seubar.'
    }
  }
  if (/\s/.test(trimmed)) return { ok: false, error: INVALID_URL }

  const withScheme = LEADING_SCHEME.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const authority = withScheme.replace(LEADING_SCHEME, '').split(/[/?#\\]/)[0]
  if (authority?.includes('@')) return { ok: false, error: INVALID_URL }

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { ok: false, error: INVALID_URL }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'O link precisa começar com http:// ou https://.'
    }
  }
  if (!PUBLIC_HOST.test(parsed.hostname)) {
    return { ok: false, error: INVALID_URL }
  }
  if (parsed.href.length > MENU_URL_MAX_LENGTH) {
    return {
      ok: false,
      error: `O link aceita até ${MENU_URL_MAX_LENGTH} caracteres.`
    }
  }
  return { ok: true, url: parsed.href }
}

/**
 * Domínio para mostrar ao lado do link, sem `www.`. Roda na renderização:
 * valor gravado por fora do `parseMenuUrl` que o navegador não entenda vira
 * `''` em vez de derrubar a página.
 */
export function menuUrlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** `null` quando o valor serve; senão, a mensagem para o campo. */
export function averageSpendCentsError(cents: number | null): string | null {
  if (cents === null) return null
  if (cents > AVERAGE_SPEND_MAX_CENTS) {
    return `O valor aceita até ${formatAverageSpend(AVERAGE_SPEND_MAX_CENTS)}.`
  }
  if (!Number.isInteger(cents) || cents <= 0) {
    return 'Informe um valor maior que zero.'
  }
  return null
}

export type AverageSpendResult =
  | { ok: true; cents: number | null }
  | { ok: false; error: string }

/**
 * Lê o valor digitado no formulário em centavos, sem passar por `float`.
 *
 * Aceita a escrita brasileira: `45`, `45,5`, `R$ 45,50`, `1.000` e
 * `1.000,00`. Sem vírgula, um ponto seguido de uma ou duas casas é decimal
 * (`45.50`); em grupos de três, é milhar. Vazio vira `null`.
 */
export function parseAverageSpendInput(input: string): AverageSpendResult {
  const value = input
    .trim()
    .replace(/^R\$\s*/i, '')
    .trim()
  if (value === '') return { ok: true, cents: null }

  let integer: string
  let fraction = ''
  // Grupo de milhar não começa com zero: `0.500` é engano de decimal, não
  // R$ 500,00.
  const withComma = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+),(\d+)$/.exec(value)
  const thousands = /^[1-9]\d{0,2}(?:\.\d{3})+$/.exec(value)
  const withDot = /^(\d+)\.(\d{1,2})$/.exec(value)

  if (withComma) {
    integer = withComma[1] ?? ''
    fraction = withComma[2] ?? ''
  } else if (thousands) {
    integer = value
  } else if (withDot) {
    integer = withDot[1] ?? ''
    fraction = withDot[2] ?? ''
  } else if (/^\d+$/.test(value)) {
    integer = value
  } else {
    return { ok: false, error: 'Informe só o valor em reais, como 45,00.' }
  }

  if (fraction.length > 2) {
    return { ok: false, error: 'Use no máximo duas casas para os centavos.' }
  }

  const cents =
    Number(integer.replaceAll('.', '')) * 100 + Number(fraction.padEnd(2, '0'))
  const error = averageSpendCentsError(cents)
  return error ? { ok: false, error } : { ok: true, cents }
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

export function formatAverageSpend(cents: number): string {
  return BRL.format(cents / 100)
}

/** O valor gravado como o campo do formulário mostra: `45,50`. */
export function averageSpendInputValue(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}
