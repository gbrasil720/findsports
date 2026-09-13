import {
  DEFAULT_EVENT_DURATION_MS,
  getEventEnd
} from '@findsports_oficial/db/event-window'

// Fim derivado vem da fonte única compartilhada com o servidor (WEB-119).
export const LIVE_WINDOW_MS = DEFAULT_EVENT_DURATION_MS

export type EventTemporalState = 'upcoming' | 'live' | 'past'

export function getEventTemporalState(
  startsAt: string | Date,
  endsAt: string | Date | null,
  now: string | Date | number = Date.now()
): EventTemporalState {
  const startsAtMs = new Date(startsAt).getTime()
  const endsAtMs = getEventEnd({ startsAt, endsAt }).getTime()
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime()

  if (nowMs < startsAtMs) return 'upcoming'
  if (nowMs <= endsAtMs) return 'live'
  return 'past'
}

export function compareEventStartsAscending(
  first: { startsAt: string | Date },
  second: { startsAt: string | Date }
): number {
  return (
    new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()
  )
}

export function compareEventStartsDescending(
  first: { startsAt: string | Date },
  second: { startsAt: string | Date }
): number {
  return compareEventStartsAscending(second, first)
}
