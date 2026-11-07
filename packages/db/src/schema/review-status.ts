import { pgEnum } from 'drizzle-orm/pg-core'
import { REVIEW_STATUSES } from '../bar-gallery'

/**
 * Revisão da Onside antes de aparecer (WEB-462 fotos, WEB-478 descrição,
 * WEB-451 comentário da avaliação). Arquivo próprio porque `platform.ts` e
 * `rating.ts` se importam: o enum dentro de um deles chegaria ao outro antes
 * de existir.
 */
export const reviewStatusEnum = pgEnum('review_status', REVIEW_STATUSES)
