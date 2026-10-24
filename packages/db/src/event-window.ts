/**
 * Relógio do jogo: o fim derivado (WEB-119, ADR 0003) e o dia de Brasília.
 *
 * `event.endsAt` é opcional: o bar informa o início e, quase nunca, o fim.
 * Toda regra que depende de "o jogo acabou" — perfil público, rótulo ao vivo,
 * avaliação, relatório comercial, validação de código de reserva — precisa do
 * MESMO fim, ou uma tela diz "ao vivo" enquanto outra já recusa o código. E
 * "hoje" é sempre o dia de Brasília, onde os bares estão, nunca o do fuso do
 * processo ou do navegador.
 *
 * Nenhum outro arquivo soma a duração padrão nem calcula o dia por conta
 * própria. Em SQL, os mesmos nomes estão em `./event-window-sql` (só
 * servidor), e um teste de integração confere que os dois lados concordam.
 *
 * Módulo sem imports de propósito: é lido pelo navegador e pelo app
 * (`@findsports_oficial/db/event-window`) e não pode arrastar driver de banco.
 */

/** O fuso dos bares. O Brasil não tem horário de verão desde 2019, mas o fuso guarda o histórico. */
export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * O dia de Brasília de um instante, "2026-10-24", mais `plusDays` dias de
 * calendário. A data AAAA-MM-DD é a que `pubs.search` recebe e a que agrupa
 * listas por dia.
 */
export function brasiliaDay(at: Date | string | number, plusDays = 0): string {
  // `en-CA` escreve AAAA-MM-DD; é a forma que o app (Hermes), o Worker e o
  // navegador já usavam.
  const day = new Date(at).toLocaleDateString('en-CA', {
    timeZone: BRASILIA_TIME_ZONE
  })
  if (!plusDays) return day
  const noon = new Date(`${day}T12:00:00Z`)
  noon.setUTCDate(noon.getUTCDate() + plusDays)
  return noon.toISOString().slice(0, 10)
}

const offsetParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BRASILIA_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23'
})

/** Quanto o relógio de Brasília está à frente do UTC em `ms` (negativo). */
function brasiliaOffsetMs(ms: number): number {
  const p = Object.fromEntries(
    offsetParts
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value])
  )
  const local = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  )
  return local - ms
}

/**
 * O instante em que o dia `day` ("2026-10-24") começa em Brasília. No dia em
 * que o horário de verão começava, a meia-noite não existia: o dia começa no
 * pulo, como no Postgres (`brasiliaDayStartSql`).
 */
export function brasiliaDayStart(day: string): Date {
  const midnight = Date.parse(`${day}T00:00:00Z`)
  const start = midnight - brasiliaOffsetMs(midnight + DAY_MS / 2)
  if (brasiliaDay(start) === day) return new Date(start)
  return new Date(midnight - brasiliaOffsetMs(midnight - DAY_MS / 2))
}

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

/** Mesma margem, como literal de `interval` do Postgres. */
export const VALIDATION_WINDOW_MARGIN_INTERVAL = `${VALIDATION_WINDOW_MARGIN_HOURS} hours`

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
 * Ao vivo: começou e não chegou ao fim derivado. O fim é exclusivo — no
 * instante do fim o jogo já acabou, como em `eventEndedSql`.
 */
export function isEventLive(
  event: EventTimes,
  now: Date | number = Date.now()
) {
  const nowMs = new Date(now).getTime()
  return (
    new Date(event.startsAt).getTime() <= nowMs &&
    nowMs < getEventEnd(event).getTime()
  )
}

/** Acabou: o fim derivado chegou. Avaliação e "Você foi?" abrem aqui. */
export function hasEventEnded(
  event: EventTimes,
  now: Date | number = Date.now()
) {
  return getEventEnd(event).getTime() <= new Date(now).getTime()
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

/** Até quando, à frente, o bar pode marcar um jogo. */
export const EVENT_START_MAX_AHEAD_DAYS = 365

const EVENT_START_MAX_AHEAD_MS =
  EVENT_START_MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000

export type EventStartProblem = 'ended' | 'too_far'

/**
 * Início que não faz sentido para um jogo novo. A data existir não basta: o
 * formulário aceitava 2019 ou 2099 (um ano a mais ou a menos digitado errado),
 * e o jogo sumia do perfil ou ia parar longe. Jogo que já começou e ainda
 * está no ar vale — o bar que cadastra atrasado. Formulário e servidor usam a
 * mesma regra.
 */
export function getEventStartProblem(
  startsAt: Date,
  now = new Date()
): EventStartProblem | null {
  if (startsAt.getTime() + DEFAULT_EVENT_DURATION_MS <= now.getTime()) {
    return 'ended'
  }
  if (startsAt.getTime() > now.getTime() + EVENT_START_MAX_AHEAD_MS) {
    return 'too_far'
  }
  return null
}

export const EVENT_START_PROBLEM_MESSAGE: Record<EventStartProblem, string> = {
  ended: 'Esse horário já passou. Confira o dia e o ano.',
  too_far: `O jogo precisa ser nos próximos ${EVENT_START_MAX_AHEAD_DAYS} dias. Confira o ano.`
}
