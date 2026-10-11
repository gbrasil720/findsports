/**
 * Limites do feedback enviado de dentro do app. Arquivo sem import de
 * servidor: o diálogo lê os mesmos números que `feedback.send` confere.
 * Tamanho e tipos de imagem são os da foto do bar (`blob-photo.ts`).
 */
export const FEEDBACK_MIN_LENGTH = 10
export const FEEDBACK_MAX_LENGTH = 2_000
export const FEEDBACK_MAX_IMAGES = 3
