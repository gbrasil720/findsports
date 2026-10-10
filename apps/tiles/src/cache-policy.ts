/**
 * Regras do Cache API no Worker de tiles (WEB-218).
 *
 * O Cache API do Workers só aceita respostas completas (status 200). Respostas
 * 206 (Range) vindas do R2 não podem ser gravadas — daí servir MVT/TileJSON
 * inteiros e cachear só 200.
 */

/** Chave de cache: URL canônica do tile ou do TileJSON. */
export function chaveDeCache(requestUrl: string): string {
  return requestUrl
}

export function podeGravarNoCache(status: number): boolean {
  return status === 200
}
