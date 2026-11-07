/**
 * Limites da avaliação (WEB-451), num lugar só: o CHECK de `bar_rating`, o
 * procedimento que grava, o pós-jogo do app e a revisão do Houdini leem daqui.
 * Não importa nada do Drizzle para poder ir ao navegador e ao app.
 */

/** Nota em estrelas, de 1 a 5. */
export const RATING_STARS_MAX = 5

/** Comentário escrito: recado curto sobre o jogo no bar, não resenha longa. */
export const RATING_COMMENT_MAX = 280

/**
 * Check-in "Estou aqui" (WEB-408): até onde do bar a posição do celular vale.
 * GPS dentro de bar erra 20 a 50 m; 150 m cobre isso sem aceitar a esquina
 * de baixo. A janela é a do código do balcão (`getValidationWindow`).
 */
export const CHECK_IN_RADIUS_M = 150
