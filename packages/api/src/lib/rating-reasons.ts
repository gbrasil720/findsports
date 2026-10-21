import { z } from 'zod'

/**
 * "O que pesou?" (WEB-398): etiquetas opcionais que acompanham o "voltaria".
 * Só etiquetas, sem texto livre (decisão do dono em 17/10/2026). Mesma regra
 * de `amenities.ts`: o id fica gravado em `bar_rating.reasons`, então nunca é
 * reusado; a posição na lista é a ordem da tela (3g).
 */
export const RATING_REASONS = [
  { id: 'sound', label: 'Som do jogo' },
  { id: 'screen', label: 'Telão' },
  { id: 'service', label: 'Atendimento' },
  { id: 'price', label: 'Preço' },
  { id: 'crowded', label: 'Lotado' },
  { id: 'food', label: 'Comida' }
] as const

export type RatingReasonId = (typeof RATING_REASONS)[number]['id']

const IDS = RATING_REASONS.map((reason) => reason.id)

export const ratingReasonsSchema = z
  .array(z.enum(IDS as [RatingReasonId, ...RatingReasonId[]]))
  .max(IDS.length)
  .transform((ids) => IDS.filter((id) => ids.includes(id)))

export const reasonLabel = (id: RatingReasonId) =>
  RATING_REASONS.find((reason) => reason.id === id)?.label ?? id

/** Quantas etiquetas o resumo mostra de cada lado ("Mais citados: …"). */
export const REASON_SUMMARY_SIZE = 3

/**
 * O resumo de "O que dizem" (2g): as etiquetas mais citadas por quem
 * voltaria e por quem não voltaria, separadas. Empate segue a ordem da tela.
 * Não leva nome nem contagem: quem decide se aparece é o mesmo piso da nota.
 */
export function summarizeReasons(
  counts: { wouldReturn: boolean; reason: string; count: number }[]
) {
  const side = (wouldReturn: boolean) =>
    IDS.map((id) => ({
      id,
      count:
        counts.find(
          (row) => row.wouldReturn === wouldReturn && row.reason === id
        )?.count ?? 0
    }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, REASON_SUMMARY_SIZE)
      .map((row) => row.id)
  return { positive: side(true), negative: side(false) }
}
