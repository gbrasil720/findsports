/**
 * Políticas de cache do React Query por natureza do dado (ESC-08).
 *
 * O padrão global do router é `staleTime: 60s`, aplicado a tudo — de esportes,
 * que mudam quando alguém edita o catálogo, a favoritos, que mudam a cada
 * clique. Um valor só para os dois extremos significa refetch demais no dado
 * estável e de menos no dado vivo.
 *
 * Estes valores complementam o cache de servidor: o servidor evita a ida ao
 * banco, e estes evitam a própria requisição.
 */

/**
 * Catálogo — esportes e times. Muda quando o time de produto edita a base,
 * não durante a sessão de ninguém. Meia hora fresco, uma hora em memória.
 */
export const CATALOG_QUERY = {
  staleTime: 30 * 60_000,
  gcTime: 60 * 60_000
} as const

/**
 * Destaques da landing. Depende de `starts_at >= NOW()`, então envelhece
 * sozinho: a janela é curta de propósito para não anunciar jogo já começado.
 * Casada com o TTL do cache de servidor, para as duas camadas expirarem
 * juntas em vez de uma servir o que a outra já descartou.
 */
export const HIGHLIGHTS_QUERY = {
  staleTime: 60_000,
  gcTime: 5 * 60_000
} as const
