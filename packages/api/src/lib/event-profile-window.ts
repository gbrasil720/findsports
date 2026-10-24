import {
  DEFAULT_EVENT_DURATION_HOURS,
  DEFAULT_EVENT_DURATION_MS
} from '@findsports_oficial/db/event-window'

/**
 * Janela em que um jogo ainda aparece no perfil público do bar.
 *
 * O perfil listava só `startsAt >= now()`. Um jogo que começou cinco minutos
 * atrás sumia da página — justamente quando o torcedor está saindo de casa e
 * a intenção é máxima. A janela mantém o jogo visível enquanto ele plausível
 * mente rola: até o fim derivado do evento.
 *
 * O número em si vive em `@findsports_oficial/db/event-window`, a fonte única
 * que também decide o rótulo "ao vivo" em `apps/web/src/domain/events.ts` e a
 * janela de validação de reserva. Estes nomes ficam como apelidos para as
 * queries que precisam do corte em SQL.
 */
export const EVENT_LIVE_WINDOW_HOURS = DEFAULT_EVENT_DURATION_HOURS

export const EVENT_LIVE_WINDOW_MS = DEFAULT_EVENT_DURATION_MS
