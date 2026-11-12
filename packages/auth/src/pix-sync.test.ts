import { describe, expect, it } from 'bun:test'
import { parsePixExternalId, pixExternalId } from './pix-sync'

describe('externalId do checkout Pix', () => {
  it('volta o bar, o plano e o fundador que entraram', () => {
    const id = pixExternalId('bar-1', 'elite', true)
    expect(parsePixExternalId(id)).toEqual({
      barId: 'bar-1',
      plan: 'elite',
      founder: true
    })
    expect(parsePixExternalId(pixExternalId('bar-2', 'pro', false))).toEqual({
      barId: 'bar-2',
      plan: 'pro',
      founder: false
    })
  })

  it('recusa o que não foi o app que criou', () => {
    expect(parsePixExternalId(null)).toBeNull()
    expect(parsePixExternalId('assinatura-123')).toBeNull()
    expect(parsePixExternalId('onside:bar:gold:f:x')).toBeNull()
    expect(parsePixExternalId('onside:bar:pro:z:x')).toBeNull()
  })
})
