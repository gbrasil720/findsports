import { and, gte, isNotNull, isNull, or } from '@findsports_oficial/db'
import {
  DEFAULT_EVENT_DURATION_HOURS,
  DEFAULT_EVENT_DURATION_MS
} from '@findsports_oficial/db/event-window'
import type { event } from '@findsports_oficial/db/schema/platform'

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

/**
 * O jogo ainda está no perfil em `now`: o corte é o fim provável do jogo, não
 * o início. Recebe as colunas do `where` de uma consulta relacional.
 *
 * Montado com operadores do Drizzle, e não com SQL cru: `event.starts_at` é
 * `timestamp` sem fuso, e comparar com `now()` (que é `timestamptz`) faria o
 * Postgres converter usando o fuso da sessão — a janela mudaria de tamanho
 * conforme o servidor. Com os operadores, o valor viaja pelo tipo da coluna.
 */
export function stillOnProfile(
  game: { startsAt: typeof event.startsAt; endsAt: typeof event.endsAt },
  now: Date
) {
  return or(
    and(isNotNull(game.endsAt), gte(game.endsAt, now)),
    and(
      isNull(game.endsAt),
      gte(game.startsAt, new Date(now.getTime() - EVENT_LIVE_WINDOW_MS))
    )
  )
}
