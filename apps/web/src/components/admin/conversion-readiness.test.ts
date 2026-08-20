import { describe, expect, test } from 'bun:test'
import type { AdminBar } from './admin-model'
import { buildReadiness } from './conversion-readiness'

const completeBar = {
  name: 'Bar da Vila',
  photoUrl: 'https://example.com/bar.jpg',
  description: 'Um ótimo lugar para assistir aos jogos.',
  address: 'Rua das Flores, 123',
  neighborhood: 'Centro',
  city: 'São Paulo',
  phone: '5511999999999',
  phoneAcceptsWhatsapp: true,
  amenities: [1, 2, 8]
} as AdminBar

describe('buildReadiness', () => {
  test('marks every profile item as complete when the bar is ready', () => {
    const readiness = buildReadiness(completeBar, true)

    expect(readiness.score).toBe(readiness.total)
    expect(readiness.checks.every((check) => check.done)).toBe(true)
  })

  test('só considera as características prontas a partir de três marcadas', () => {
    const duas = buildReadiness({ ...completeBar, amenities: [1, 2] }, true)
    const tres = buildReadiness({ ...completeBar, amenities: [1, 2, 8] }, true)

    expect(duas.checks.find((check) => check.key === 'amenities')?.done).toBe(
      false
    )
    expect(tres.checks.find((check) => check.key === 'amenities')?.done).toBe(
      true
    )
  })

  test('requires a valid phone before WhatsApp can be considered active', () => {
    const readiness = buildReadiness(
      { ...completeBar, phone: null, phoneAcceptsWhatsapp: true },
      true
    )

    expect(readiness.checks.find((check) => check.key === 'phone')?.done).toBe(
      false
    )
    expect(
      readiness.checks.find((check) => check.key === 'whatsapp')?.done
    ).toBe(false)
  })

  test('keeps the upcoming event as an independent readiness item', () => {
    const readiness = buildReadiness(completeBar, false)

    expect(
      readiness.checks.find((check) => check.key === 'upcoming_event')?.done
    ).toBe(false)
    expect(readiness.score).toBe(readiness.total - 1)
  })
})
