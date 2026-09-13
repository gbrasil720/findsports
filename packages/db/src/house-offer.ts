/**
 * Oferta da casa (WEB-120): o que o bar promete a quem chega pela Onside.
 *
 * Vive no pacote do banco, e não na API, porque três lugares precisam do mesmo
 * número e da mesma normalização: o CHECK da coluna `bar.house_offer`, o
 * procedimento que grava, e o contador do formulário no painel. Este arquivo
 * não importa nada do Drizzle para poder ir ao navegador.
 *
 * A Onside não define, sugere nem valida o conteúdo: a normalização só mexe em
 * espaço em branco.
 */

/** Limite da oferta. Curto de propósito: é uma linha, não um cardápio. */
export const HOUSE_OFFER_MAX_LENGTH = 140

/**
 * Forma gravada do texto digitado: espaços e quebras de linha viram um espaço
 * só, sem sobra nas pontas. Texto vazio vira `null` — limpar a oferta é mandar
 * o campo em branco.
 *
 * O limite é contado DEPOIS desta função, tanto no servidor quanto no
 * contador do formulário: quem cola um texto com espaços duplicados não pode
 * ver "passou do limite" num texto que cabe.
 */
export function normalizeHouseOffer(
  input: string | null | undefined
): string | null {
  if (input == null) return null
  const collapsed = input.replace(/\s+/g, ' ').trim()
  return collapsed === '' ? null : collapsed
}

/** Comprimento em caracteres, como o `char_length` do CHECK conta. */
export function houseOfferLength(value: string | null): number {
  return value === null ? 0 : Array.from(value).length
}
