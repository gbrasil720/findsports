/**
 * Limites da reserva (WEB-124, WEB-152), num lugar só.
 *
 * Vive no pacote do banco pelo mesmo motivo de `house-offer.ts`: os CHECKs de
 * `reservation.note` e do teto de pessoas por jogo leem daqui. Este arquivo
 * não importa nada do Drizzle para poder ir ao navegador.
 */

/** Limite da observação livre. Recado para o bar, não conversa. */
export const RESERVATION_NOTE_MAX_LENGTH = 280

/**
 * Maior teto de pessoas por jogo (WEB-152). Só barra digitação errada: o
 * número real é do dono.
 */
export const RESERVATION_CAP_MAX = 5000
