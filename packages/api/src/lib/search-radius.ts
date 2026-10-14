import {
  SEARCH_RADIUS_MAX_KM,
  SEARCH_RADIUS_MIN_KM
} from '@findsports_oficial/db/search-radius'
import { z } from 'zod'

/** Raio de busca aceito na entrada: quilômetro inteiro de 1 a 50. */
export const searchRadiusKmSchema = z
  .number()
  .int()
  .min(SEARCH_RADIUS_MIN_KM)
  .max(SEARCH_RADIUS_MAX_KM)
