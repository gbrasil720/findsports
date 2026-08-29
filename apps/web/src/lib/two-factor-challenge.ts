import { getSafeCallbackUrl } from '@/utils/callback-url'

const MAX_CHALLENGE_AGE_MS = 10 * 60 * 1000
export const TWO_FACTOR_CHALLENGE_KEY = 'onside:two-factor-challenge'

export type TwoFactorChallenge = {
  callbackUrl: string
  startedAt: number
}

export function createTwoFactorChallenge(
  callbackUrl: string,
  startedAt = Date.now()
): TwoFactorChallenge {
  return { callbackUrl: getSafeCallbackUrl(callbackUrl, '/'), startedAt }
}

export function isTwoFactorChallengeCurrent(
  value: unknown,
  now = Date.now()
): value is TwoFactorChallenge {
  if (!value || typeof value !== 'object') return false
  const challenge = value as Partial<TwoFactorChallenge>
  return (
    typeof challenge.startedAt === 'number' &&
    challenge.startedAt <= now &&
    now - challenge.startedAt < MAX_CHALLENGE_AGE_MS &&
    typeof challenge.callbackUrl === 'string' &&
    getSafeCallbackUrl(challenge.callbackUrl, '/') === challenge.callbackUrl
  )
}
