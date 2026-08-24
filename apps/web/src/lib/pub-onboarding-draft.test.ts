import { describe, expect, it } from 'bun:test'
import {
  parsePubOnboardingDraft,
  serializePubOnboardingDraft
} from './pub-onboarding-draft'

const DRAFT = {
  name: 'Bar do Teste',
  neighborhood: 'Centro',
  address: 'Rua Um, 10'
}

describe('rascunho do onboarding de bar', () => {
  it('sobrevive ao retorno do e-mail por até duas horas', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 1_000)
    expect(parsePubOnboardingDraft(serialized, 2_000)).toEqual(DRAFT)
  })

  it('recusa rascunho expirado ou malformado', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 1_000)
    expect(parsePubOnboardingDraft(serialized, 7_201_001)).toBeNull()
    expect(parsePubOnboardingDraft('{')).toBeNull()
    expect(parsePubOnboardingDraft(JSON.stringify({ draft: {} }))).toBeNull()
  })
})
