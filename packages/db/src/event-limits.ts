/**
 * Limites dos textos de um jogo (WEB-265), num lugar só.
 *
 * Vive no pacote do banco pelo mesmo motivo de `reservation-limits.ts`: o
 * procedimento que grava (`pub.createEvent`, `pub.updateEvent`) e o formulário
 * do painel precisam do mesmo número, ou o formulário aceita o que o servidor
 * recusa. Este arquivo não importa nada para poder ir ao navegador.
 *
 * Os dois lados contam `string.length`, como o `z.string().max()` conta.
 */

export const EVENT_CHAMPIONSHIP_MIN_LENGTH = 2

export const EVENT_CHAMPIONSHIP_MAX_LENGTH = 150

/** Times ou participantes escritos à mão, quando não há time cadastrado. */
export const EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH = 200
