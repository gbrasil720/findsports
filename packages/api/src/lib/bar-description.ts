import { sql } from '@findsports_oficial/db'

/**
 * Descrição do bar em texto livre (WEB-478): a Onside revisa antes de o
 * torcedor ver. `bar.description` é a publicada (a última aprovada); o que o
 * dono escreve vai para `description_pending` e espera o Houdini.
 *
 * Apagar a descrição não espera revisão: tirar texto do ar não põe nada no ar.
 * Mandar de volta o texto publicado desfaz o pedido.
 */
export function descriptionSubmission(published: string | null, input: string) {
  const text = input.trim()
  const clear = {
    descriptionPending: null,
    descriptionReview: null,
    descriptionRejectionReason: null,
    descriptionSubmittedAt: null
  }
  if (!text) return { description: null, ...clear }
  if (text === (published ?? '').trim()) return clear
  return {
    descriptionPending: text,
    descriptionReview: 'pending' as const,
    descriptionRejectionReason: null,
    // O relógio do banco: `timestamp` sem fuso.
    descriptionSubmittedAt: sql`now()`
  }
}
