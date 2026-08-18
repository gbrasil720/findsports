import { describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { resolvePhoneAcceptsWhatsapp } from './pub'

describe('resolvePhoneAcceptsWhatsapp', () => {
  // -----------------------------------------------------------------------
  // No input — only revoke on phone change
  // -----------------------------------------------------------------------

  it('returns null when no input and no phone change', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      undefined,
      undefined,
      '11999999999'
    )
    expect(result).toBeNull()
  })

  it('revokes to false when phone changes and no explicit accepts input', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      undefined,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('returns null when phone unchanged and no explicit accepts input', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '11999999999',
      undefined,
      '11999999999'
    )
    expect(result).toBeNull()
  })

  it('returns null when bar has no phone and no input', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, undefined, null)
    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Confirm true — requires phone
  // -----------------------------------------------------------------------

  it('confirms true when bar has existing phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, true, '11999999999')
    expect(result).toEqual({ value: true, changed: true })
  })

  it('confirms true when phone sent in same call', () => {
    const result = resolvePhoneAcceptsWhatsapp('11999999999', true, null)
    expect(result).toEqual({ value: true, changed: true })
  })

  it('confirms true when phone sent and bar had different phone (phone change revokes)', () => {
    // Phone changed → revoke atomically even if input tries true
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('throws when confirming true without any phone', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, null)).toThrow(
      TRPCError
    )
  })

  it('throws when confirming true with empty phone string', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, '   ')).toThrow(
      TRPCError
    )
  })

  it('throws when confirming true with empty phone in input', () => {
    expect(() => resolvePhoneAcceptsWhatsapp('', true, null)).toThrow(TRPCError)
  })

  // -----------------------------------------------------------------------
  // Confirm false — always allowed
  // -----------------------------------------------------------------------

  it('confirms false when bar has phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, false, '11999999999')
    expect(result).toEqual({ value: false, changed: true })
  })

  it('confirms false when bar has no phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, false, null)
    expect(result).toEqual({ value: false, changed: true })
  })

  // -----------------------------------------------------------------------
  // Phone change — atomic revocation
  // -----------------------------------------------------------------------

  it('revokes to false when phone changes regardless of input true', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('revokes to false when phone changes and input is false', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      false,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('allows confirming true on subsequent call with registered phone', () => {
    // First call: set phone + confirm true → allowed (initial setup, not a change)
    const first = resolvePhoneAcceptsWhatsapp('11999999999', true, null)
    expect(first).toEqual({ value: true, changed: true })

    // Second call: reuse registered phone + confirm true → still succeeds
    const second = resolvePhoneAcceptsWhatsapp(undefined, true, '11999999999')
    expect(second).toEqual({ value: true, changed: true })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles whitespace-only existing phone as no phone', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, '   ')).toThrow(
      TRPCError
    )
  })

  it('treats same phone string as no change', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '11999999999',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: true, changed: true })
  })
})
