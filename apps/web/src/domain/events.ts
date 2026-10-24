import { hasEventEnded } from '@findsports_oficial/db/event-window'

export type EventTemporalState = 'upcoming' | 'live' | 'past'

export function getEventTemporalState(
  startsAt: string | Date,
  endsAt: string | Date | null,
  now: string | Date | number = Date.now()
): EventTemporalState {
  const nowMs = new Date(now).getTime()
  if (nowMs < new Date(startsAt).getTime()) return 'upcoming'
  return hasEventEnded({ startsAt, endsAt }, nowMs) ? 'past' : 'live'
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
