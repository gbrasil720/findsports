import {
  RATING_COMMENT_MAX,
  RATING_STARS_MAX
} from '@findsports_oficial/db/rating-limits'
import { z } from 'zod'

/**
 * O que a avaliação ganhou no WEB-451, além de "voltaria" e etiquetas: nota
 * em estrelas, comentário escrito (que passa pela revisão da Onside antes de
 * aparecer) e a escolha de aparecer com o nome ou anônimo.
 */
export const ratingDetailsSchema = z.object({
  stars: z.number().int().min(1).max(RATING_STARS_MAX),
  // Vazio é "sem comentário"; espaço sobrando não vai para a revisão.
  comment: z
    .string()
    .trim()
    .max(RATING_COMMENT_MAX)
    .transform((text) => text || null)
    .nullable()
    .default(null),
  identified: z.boolean().default(false)
})

export type RatingDetails = z.infer<typeof ratingDetailsSchema>

/**
 * Média das estrelas com uma casa ("4,6" no design 2c). `null` sem estrelas
 * ou abaixo do mesmo piso da nota: média de duas estrelas não é informação.
 */
export function starsAverage(sum: number, count: number, floor: number) {
  if (count < floor || count <= 0) return null
  return Math.round((sum / count) * 10) / 10
}
