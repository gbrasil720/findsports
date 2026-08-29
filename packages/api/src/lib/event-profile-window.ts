/**
 * Janela em que um jogo ainda aparece no perfil público do bar.
 *
 * O perfil listava só `startsAt >= now()`. Um jogo que começou cinco minutos
 * atrás sumia da página — justamente quando o torcedor está saindo de casa e
 * a intenção é máxima. A janela mantém o jogo visível enquanto ele plausível
 * mente rola: até `endsAt`, quando o bar informou, ou três horas depois do
 * apito quando não informou.
 *
 * O mesmo número vive em `apps/web/src/domain/events.ts` (`LIVE_WINDOW_MS`),
 * que decide o rótulo "ao vivo" na interface. Os dois precisam concordar: se
 * a janela do servidor for menor, o jogo some antes do rótulo expirar; se for
 * maior, a página mostra como futuro um jogo que já acabou.
 */
export const EVENT_LIVE_WINDOW_HOURS = 3

export const EVENT_LIVE_WINDOW_MS = EVENT_LIVE_WINDOW_HOURS * 60 * 60 * 1000

/**
 * Espelho em TypeScript do predicado SQL usado em `pubs.getById`. Existe para
 * que o limite da janela seja testável sem banco — a query e esta função
 * precisam responder igual nas bordas.
 */
export function isEventVisibleOnProfile(
  startsAt: Date,
  endsAt: Date | null,
  now: Date = new Date()
): boolean {
  const end = endsAt ?? new Date(startsAt.getTime() + EVENT_LIVE_WINDOW_MS)
  return end.getTime() >= now.getTime()
}
