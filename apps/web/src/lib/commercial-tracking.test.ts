import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { trackCommercialEvent } from './commercial-tracking'

describe('commercial-tracking', () => {
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    mockFetch = mock().mockResolvedValue({ ok: true, json: async () => ({}) })
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    mock.restore()
  })

  it('sends profile_view with pubId and type', () => {
    trackCommercialEvent({
      pubId: 'pub-1',
      type: 'profile_view'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/bar/commercial-event',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ pubId: 'pub-1', type: 'profile_view' })
  })

  it('includes sourceEventId when valid UUID', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    trackCommercialEvent({
      pubId: 'pub-1',
      type: 'whatsapp_opened',
      sourceEventId: uuid
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sourceEventId).toBe(uuid)
  })

  it('strips invalid sourceEventId', () => {
    trackCommercialEvent({
      pubId: 'pub-1',
      type: 'phone_clicked',
      sourceEventId: 'invalid-id'
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sourceEventId).toBeUndefined()
  })

  it('strips empty sourceEventId', () => {
    trackCommercialEvent({
      pubId: 'pub-1',
      type: 'directions_opened',
      sourceEventId: ''
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sourceEventId).toBeUndefined()
  })

  it('strips null sourceEventId', () => {
    trackCommercialEvent({
      pubId: 'pub-1',
      type: 'profile_view',
      sourceEventId: null as never
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sourceEventId).toBeUndefined()
  })

  it('uses correct endpoint /api/bar/commercial-event', () => {
    trackCommercialEvent({ pubId: 'x', type: 'profile_view' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/bar/commercial-event',
      expect.any(Object)
    )
  })

  it('does not throw on fetch failure', () => {
    globalThis.fetch = mock().mockRejectedValue(
      new Error('network error')
    ) as unknown as typeof fetch

    expect(() =>
      trackCommercialEvent({ pubId: 'x', type: 'profile_view' })
    ).not.toThrow()
  })

  it('supports all commercial event types', () => {
    const types: readonly (
      | 'profile_view'
      | 'directions_opened'
      | 'phone_clicked'
      | 'whatsapp_opened'
    )[] = [
      'profile_view',
      'directions_opened',
      'phone_clicked',
      'whatsapp_opened'
    ]

    types.forEach((t) => {
      mockFetch.mockClear()
      trackCommercialEvent({ pubId: 'pub-1', type: t })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe(t)
    })
  })
})
