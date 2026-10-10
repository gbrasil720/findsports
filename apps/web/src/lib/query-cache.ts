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
 * Fila e teto de reservas do bar (WEB-158). O pedido chega de outro usuário,
 * sem nenhum clique aqui: o painel aberto no balcão consulta sozinho. O React
 * Query pausa o intervalo com a aba do navegador em segundo plano.
 */
export const BAR_RESERVATIONS_QUERY = {
  refetchInterval: 30_000
} as const
