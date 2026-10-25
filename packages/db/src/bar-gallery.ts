/**
 * Galeria de fotos do ambiente (WEB-439): fotos além da capa, do Pro para
 * cima. Vive no pacote do banco pelo mesmo motivo de `bar-menu.ts`: o CHECK
 * da coluna, o procedimento que grava e o painel leem o mesmo teto. Não
 * importa nada do Drizzle para poder ir ao navegador.
 */

/**
 * Quantas fotos cabem na galeria, além da capa. Oito enchem a página do bar
 * sem virar álbum: o torcedor quer ver o telão e o salão, não a festa toda.
 */
export const GALLERY_MAX_PHOTOS = 8
