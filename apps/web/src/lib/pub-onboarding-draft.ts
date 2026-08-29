export const PUB_ONBOARDING_DRAFT_KEY = 'onside:pub-onboarding-draft'
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000

export type PubOnboardingDraft = {
  name: string
  neighborhood: string
  city?: string
  address: string
  phone?: string
  description?: string
  amenities?: number[]
  screenCount?: number
}

export function serializePubOnboardingDraft(
  draft: PubOnboardingDraft,
  now = Date.now()
): string {
  return JSON.stringify({ draft, expiresAt: now + DRAFT_TTL_MS })
}

export function parsePubOnboardingDraft(
  value: string | null,
  now = Date.now()
): PubOnboardingDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as {
      draft?: PubOnboardingDraft
      expiresAt?: number
    }
    if (!parsed.draft || !parsed.expiresAt || parsed.expiresAt <= now) {
      return null
    }
    if (
      typeof parsed.draft.name !== 'string' ||
      typeof parsed.draft.neighborhood !== 'string' ||
      typeof parsed.draft.address !== 'string'
    ) {
      return null
    }
    return parsed.draft
  } catch {
    return null
  }
}
