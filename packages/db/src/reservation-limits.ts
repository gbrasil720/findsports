/**
 * Limites do pedido de reserva (WEB-124), num lugar só.
 *
 * Vive no pacote do banco pelo mesmo motivo de `house-offer.ts`: o CHECK da
 * coluna `reservation.note`, o procedimento que cria o pedido e o formulário
 * do torcedor contam igual. Este arquivo não importa nada do Drizzle para
 * poder ir ao navegador.
 *
 * Não existe regra de produto para tamanho de grupo, antecedência mínima nem
 * prazo de resposta do bar. Os números abaixo são palpites de operação; mudar
 * aqui muda servidor e tela juntos. Antecedência mínima e prazo de resposta
 * não existem: basta o jogo não ter começado.
 */

/** Limite da observação livre. Recado para o bar, não conversa. */
export const RESERVATION_NOTE_MAX_LENGTH = 280

/**
 * Maior grupo aceito num pedido. Palpite: sem mapa de mesas, grupo maior que
 * isso é evento fechado, e isso se combina com o bar, não por formulário.
 */
export const RESERVATION_PARTY_SIZE_MAX = 20

/**
 * Maior teto de pessoas por jogo (WEB-152). Só barra digitação errada: o
 * número real é do dono.
 */
export const RESERVATION_CAP_MAX = 5000

/**
 * Forma gravada da observação: sem sobra nas pontas, vazia vira `null`. As
 * quebras de linha ficam — o recado é do torcedor.
 */
export function normalizeReservationNote(
  input: string | null | undefined
): string | null {
  const trimmed = input?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** Comprimento em caracteres, como o `char_length` do CHECK conta. */
export function reservationNoteLength(value: string | null): number {
  return value === null ? 0 : Array.from(value).length
}
