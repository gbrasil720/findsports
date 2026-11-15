import { expect, test } from 'bun:test'
import { packMarker, unpackMarker } from './pending-marker'

const NOW = 1_000_000

test('vale dentro do prazo e some depois', () => {
  const raw = packMarker('abc', 60_000, NOW)
  expect(unpackMarker(raw, NOW + 59_999)).toBe('abc')
  expect(unpackMarker(raw, NOW + 60_000)).toBeNull()
})

test('preso a uma conta, só ela lê', () => {
  const raw = packMarker('GB-4821', 60_000, NOW, 'user-a')
  expect(unpackMarker(raw, NOW, 'user-a')).toBe('GB-4821')
  expect(unpackMarker(raw, NOW, 'user-b')).toBeNull()
  expect(unpackMarker(raw, NOW)).toBeNull()
})

test('formato antigo ou estragado não vale', () => {
  // O convite antigo era o código cru, sem prazo.
  expect(unpackMarker('GB-4821', NOW)).toBeNull()
  expect(unpackMarker('{"value":"x"}', NOW)).toBeNull()
  expect(unpackMarker('{"value":"","expiresAt":9e15}', NOW)).toBeNull()
  expect(unpackMarker(null, NOW)).toBeNull()
})
