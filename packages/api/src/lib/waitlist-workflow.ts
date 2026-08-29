export function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function hashWaitlistToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export async function createWaitlistToken() {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    '-',
    ''
  )
  return { token, hash: await hashWaitlistToken(token) }
}

export function shouldAdmitSignup(input: {
  signupClosed: boolean
  approved: boolean
}) {
  return !input.signupClosed || input.approved
}

type LaunchNoticeCandidate = {
  confirmedAt: Date | string | null
  cancelledAt: Date | string | null
  activatedAt: Date | string | null
  inviteExpiresAt: Date | string | null
  launchNoticeSentAt: Date | string | null
}

export function isLaunchNoticeEligible(
  candidate: LaunchNoticeCandidate,
  now: Date
) {
  if (
    !candidate.confirmedAt ||
    candidate.cancelledAt ||
    candidate.activatedAt ||
    candidate.launchNoticeSentAt
  ) {
    return false
  }
  return (
    !candidate.inviteExpiresAt || new Date(candidate.inviteExpiresAt) <= now
  )
}
