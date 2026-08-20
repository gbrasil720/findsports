/**
 * Avaliação de bar: "voltaria para ver jogo aqui?".
 *
 * A pergunta é binária e presa a UM jogo. Não é nota do bar em geral — isso
 * o Google Maps já faz há dez anos e faz melhor. É nota da experiência de
 * assistir, que é a única que a Onside pode ter e a única que responde o que
 * o torcedor veio perguntar.
 *
 * Amarrar ao jogo também é o que faz a nota envelhecer sozinha: um bar que
 * piorou acumula jogo ruim novo, em vez de carregar para sempre uma média
 * formada há dois anos.
 */

/**
 * Quantas avaliações um bar precisa para ter nota PÚBLICA.
 *
 * Existe porque média com amostra minúscula não é informação: um bar com uma
 * avaliação positiva marca 100% e passaria na frente de um com quarenta
 * avaliações e 85%. Abaixo do piso ninguém vê a nota — nem boa, nem ruim, e
 * a regra vale igual para todo bar. Não é escolha do dono: um interruptor de
 * "mostrar minhas notas" faria todo bar bem avaliado mostrar e todo bar mal
 * avaliado esconder, até que "não mostra" virasse, publicamente, "as notas
 * são ruins".
 *
 * Subir este número é seguro e não pede migration: o índice parcial da busca
 * usa `rating_count > 0`, que cobre qualquer piso maior ou igual a 1. O
 * painel do dono ignora o piso — ele vê tudo desde a primeira avaliação.
 */
export const RATING_PUBLIC_FLOOR = 3

/**
 * Por quanto tempo, depois do jogo, o torcedor ainda pode avaliar.
 *
 * Avaliação sobre jogo de um mês atrás é memória, não observação — e é onde
 * mora a avaliação movida por raiva acumulada. Duas semanas cobrem quem só
 * abre o app no fim de semana seguinte.
 */
export const RATING_WINDOW_DAYS = 14

/** Constante do Wilson, para 95% de confiança. */
const Z = 1.96

/**
 * Limite inferior do intervalo de confiança de Wilson.
 *
 * É o que a busca usa para ordenar, no lugar da média. A diferença importa
 * exatamente no caso que mais aparece no começo: com uma avaliação positiva
 * a média diz 1,0 e o Wilson diz ~0,21 — o bar de uma avaliação não passa na
 * frente do de quarenta, e sobe sozinho conforme junta amostra, sem ninguém
 * precisar arbitrar.
 *
 * A mesma fórmula está escrita em SQL na coluna gerada `bar.rating_score`
 * (migration 0022). As duas precisam concordar, e é isso que o teste
 * `rating.integration.test.ts` trava — uma cópia de fórmula que diverge em
 * silêncio reordena a busca inteira sem nenhum sintoma.
 */
export function wilsonLowerBound(positive: number, total: number): number {
  if (total <= 0) return 0

  const p = positive / total
  const denominator = 1 + (Z * Z) / total
  const center = p + (Z * Z) / (2 * total)
  const margin = Z * Math.sqrt((p * (1 - p) + (Z * Z) / (4 * total)) / total)

  return (center - margin) / denominator
}

/** A nota é pública? Regra da plataforma, igual para todo bar. */
export function hasPublicRating(ratingCount: number): boolean {
  return ratingCount >= RATING_PUBLIC_FLOOR
}

/**
 * Percentual exibido ao torcedor. Arredondado para inteiro: casa decimal em
 * cima de três avaliações finge uma precisão que não existe.
 */
export function ratingPercentage(positive: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((positive / total) * 100)
}
