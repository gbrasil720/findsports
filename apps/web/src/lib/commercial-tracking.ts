/**
 * Fire-and-forget tracking for pub commercial events.
 *
 * Uses keepalive fetch so events are delivered even when the user
 * navigates away (clicks WhatsApp, opens maps, etc.).
 *
 * Calls a dedicated REST endpoint — no tRPC wire format.
 */

import type { COMMERCIAL_EVENT_TYPES } from '@findsports_oficial/api/lib/commercial-analytics/types'

type CommercialEventType = (typeof COMMERCIAL_EVENT_TYPES)[number]

export interface CommercialEventPayload {
  pubId: string
  type: CommercialEventType
  sourceEventId?: string
  recommendationRunId?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Record a commercial event via the dedicated REST endpoint.
 * keepalive: true ensures delivery even on page navigation.
 */
export function trackCommercialEvent(payload: CommercialEventPayload): void {
  const body: Record<string, unknown> = {
    pubId: payload.pubId,
    type: payload.type
  }
  if (payload.sourceEventId && UUID_RE.test(payload.sourceEventId)) {
    body.sourceEventId = payload.sourceEventId
  }
  if (
    payload.recommendationRunId &&
    UUID_RE.test(payload.recommendationRunId)
  ) {
    body.recommendationRunId = payload.recommendationRunId
  }

  fetch('/api/bar/commercial-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(body)
  }).catch(() => {
    // Silently fail — tracking is best-effort
  })
}

/**
 * Track a profile view event.
 */
export function trackProfileView(pubId: string): void {
  trackCommercialEvent({ pubId, type: 'profile_view' })
}

/**
 * Track a directions opened event.
 */
export function trackDirectionsOpened(
  pubId: string,
  sourceEventId?: string
): void {
  trackCommercialEvent({ pubId, type: 'directions_opened', sourceEventId })
}

/**
 * Track a phone clicked event.
 */
export function trackPhoneClicked(pubId: string, sourceEventId?: string): void {
  trackCommercialEvent({ pubId, type: 'phone_clicked', sourceEventId })
}

/**
 * Track a WhatsApp opened event.
 */
export function trackWhatsappOpened(
  pubId: string,
  sourceEventId?: string
): void {
  trackCommercialEvent({ pubId, type: 'whatsapp_opened', sourceEventId })
}
