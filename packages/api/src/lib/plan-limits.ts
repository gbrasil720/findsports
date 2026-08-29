/**
 * Limites de plano que a interface também precisa dizer em voz alta.
 *
 * Módulo folha, sem importar banco nem ORM, de propósito: a tela de planos é
 * cliente e não pode arrastar o servidor para dentro do bundle só para saber
 * quantos jogos o Starter permite.
 *
 * Antes o número vivia em dois lugares — na política que barra a criação e na
 * lista de vantagens do plano, escrito à mão. Enquanto os dois concordassem,
 * ninguém notaria; no dia em que o limite mudar, um deles mente para quem
 * está decidindo se assina.
 */
export const STARTER_EVENT_LIMIT = 5
