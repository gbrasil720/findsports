/**
 * Fonte única do tempo derivado de um jogo (WEB-119).
 *
 * `event.endsAt` é opcional: o bar informa o início e, quase nunca, o fim.
 * Toda regra que depende de "o jogo acabou" — perfil público, rótulo ao vivo,
 * avaliação, relatório comercial, validação de código de reserva — precisa do
 * MESMO fim, ou uma tela diz "ao vivo" enquanto outra já recusa o código.
 *
 * Por isso nenhum outro arquivo soma a duração padrão por conta própria:
 * TypeScript chama `getEventEnd`, SQL usa `DEFAULT_EVENT_DURATION_INTERVAL`.
 *
 * Módulo sem imports de propósito: é lido pelo navegador
 * (`@findsports_oficial/db/event-window`) e não pode arrastar driver de banco.
 */

/**
 * Duração assumida quando o bar não informou `endsAt`.
 *
 * Número de produto que ninguém definiu formalmente. Três horas é o valor que
 * o perfil público e o rótulo "ao vivo" já usavam antes deste módulo — cobre
 * futebol com prorrogação, pênaltis e o fim de papo no bar. Mudar aqui muda
 * todas as regras ao mesmo tempo, que é justamente o objetivo.
 */
export const DEFAULT_EVENT_DURATION_HOURS = 3

export const DEFAULT_EVENT_DURATION_MS =
  DEFAULT_EVENT_DURATION_HOURS * 60 * 60 * 1000

/** Mesma duração, como literal de `interval` do Postgres. */
export const DEFAULT_EVENT_DURATION_INTERVAL = `${DEFAULT_EVENT_DURATION_HOURS} hours`

/**
 * Margem antes do início e depois do fim derivado em que o código de reserva
 * pode ser validado no bar. Antes: o torcedor chega cedo para pegar mesa.
 * Depois: o bar registra quem ficou para o pós-jogo.
 */
export const VALIDATION_WINDOW_MARGIN_HOURS = 3

export const VALIDATION_WINDOW_MARGIN_MS =
  VALIDATION_WINDOW_MARGIN_HOURS * 60 * 60 * 1000

type EventTimes = {
  startsAt: Date | string
  endsAt: Date | string | null
}

/** Fim derivado: `endsAt ?? startsAt + duração padrão`. */
export function getEventEnd({ startsAt, endsAt }: EventTimes): Date {
  if (endsAt) return new Date(endsAt)
  return new Date(new Date(startsAt).getTime() + DEFAULT_EVENT_DURATION_MS)
}

/**
 * Janela de validação do código de reserva: abre `startsAt - margem`, fecha
 * `fim derivado + margem`. Os dois limites são inclusivos.
 */
export function getValidationWindow(event: EventTimes): {
  opensAt: Date
  closesAt: Date
} {
  return {
    opensAt: new Date(
      new Date(event.startsAt).getTime() - VALIDATION_WINDOW_MARGIN_MS
    ),
    closesAt: new Date(
      getEventEnd(event).getTime() + VALIDATION_WINDOW_MARGIN_MS
    )
  }
}

export function isWithinValidationWindow(
  event: EventTimes,
  now: Date = new Date()
): boolean {
  const { opensAt, closesAt } = getValidationWindow(event)
  const nowMs = now.getTime()
  return nowMs >= opensAt.getTime() && nowMs <= closesAt.getTime()
}
