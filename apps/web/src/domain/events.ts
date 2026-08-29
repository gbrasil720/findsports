export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

export type EventTemporalState = 'upcoming' | 'live' | 'past'

export function getEventTemporalState(
  startsAt: string | Date,
  now: string | Date | number = Date.now()
): EventTemporalState {
  const startsAtMs = new Date(startsAt).getTime()
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime()

  if (nowMs < startsAtMs) return 'upcoming'
  if (nowMs <= startsAtMs + LIVE_WINDOW_MS) return 'live'
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
