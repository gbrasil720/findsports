/**
 * Raio de busca do torcedor, num lugar só. Antes era uma escala fixa
 * (1, 3, 5, 10) repetida no servidor e nas telas; agora vale qualquer
 * quilômetro inteiro até 50, porque quem mora longe dos bares precisa ir além
 * de 10 km.
 *
 * Vive no pacote do banco pelo mesmo motivo de `event-limits.ts`: servidor,
 * campo do better-auth e telas precisam do mesmo número. Sem imports, para
 * poder ir ao navegador.
 */

export const SEARCH_RADIUS_MIN_KM = 1

export const SEARCH_RADIUS_MAX_KM = 50

/**
 * Valor salvo ou recebido → quilômetro válido. `search_radius_km` é um
 * `integer` sem restrição no banco: um valor fora da faixa vira a borda mais
 * próxima, e lixo vira `fallback`.
 */
export function clampSearchRadiusKm(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(
    SEARCH_RADIUS_MAX_KM,
    Math.max(SEARCH_RADIUS_MIN_KM, Math.round(value))
  )
}
