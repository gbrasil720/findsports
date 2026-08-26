import { getPageSurface } from './page-surface'
import { withPosthog } from './posthog'

export type UserRole = 'fan' | 'pub'
export type BarPlan = 'starter' | 'pro' | 'elite'
export type BarOpenSource = 'card' | 'map'
export type BarIntentAction = 'directions' | 'whatsapp' | 'phone' | 'favorite'
export type { PageSurface } from './page-surface'

/**
 * Product analytics — only events that answer an internal usage question.
 * Pageviews stay on `$pageview` (with `surface`). Autocapture is off.
 */
export const analytics = {
  identifyWaitlist: (waitlistId: string) => {
    void withPosthog((posthog) => posthog.identify(`waitlist:${waitlistId}`))
  },

  waitlistSubmitted: (role: UserRole) => {
    void withPosthog((posthog) =>
      posthog.capture('waitlist_submitted', { role })
    )
  },

  waitlistConfirmed: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_confirmed'))
  },

  waitlistCancelled: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_cancelled'))
  },

  waitlistInviteSent: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_invite_sent'))
  },

  waitlistInviteOpened: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_invite_opened'))
  },

  waitlistActivated: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_activated'))
  },

  launchNoticeSent: (sent: number, failed: number) => {
    void withPosthog((posthog) =>
      posthog.capture('waitlist_launch_notice_sent', { sent, failed })
    )
  },

  launchSignupCompleted: () => {
    void withPosthog((posthog) =>
      posthog.capture('waitlist_launch_signup_completed')
    )
  },

  launchNoticeOpened: () => {
    void withPosthog((posthog) => posthog.capture('waitlist_launch_opened'))
  },

  signupCompleted: (role: UserRole) => {
    void withPosthog((posthog) => {
      posthog.capture('signup_completed', { role })
      posthog.setPersonProperties({ role })
    })
  },

  onboardingCompleted: (params: {
    role: UserRole
    sports?: string[]
    radius_km?: number
  }) => {
    const sportsCount = params.sports?.length
    void withPosthog((posthog) => {
      posthog.capture('onboarding_completed', {
        role: params.role,
        sports: params.sports,
        sports_count: sportsCount,
        radius_km: params.radius_km
      })
      posthog.setPersonProperties({
        role: params.role,
        onboarding_completed: true,
        ...(params.sports ? { sports: params.sports } : {}),
        ...(sportsCount != null ? { sports_count: sportsCount } : {}),
        ...(params.radius_km != null ? { radius_km: params.radius_km } : {})
      })
    })
  },

  searchPerformed: (params: {
    sport?: string
    championship?: string
    radius_km: number
    results_count: number
    has_location: boolean
  }) => {
    void withPosthog((posthog) => posthog.capture('search_performed', params))
  },

  barOpened: (params: {
    bar_id: string
    source: BarOpenSource
    bar_plan?: BarPlan
  }) => {
    void withPosthog((posthog) => posthog.capture('bar_opened', params))
  },

  barIntent: (params: { bar_id: string; action: BarIntentAction }) => {
    void withPosthog((posthog) => posthog.capture('bar_intent', params))
  },

  eventCreated: (params: {
    championship: string
    sport: string
    has_teams: boolean
  }) => {
    void withPosthog((posthog) => posthog.capture('event_created', params))
  },

  eventLimitReached: () => {
    void withPosthog((posthog) => posthog.capture('event_limit_reached'))
  },

  checkoutStarted: (plan: BarPlan) => {
    void withPosthog((posthog) => posthog.capture('checkout_started', { plan }))
  },

  upgradeClicked: (current_plan: string, target_plan: string) => {
    void withPosthog((posthog) =>
      posthog.capture('upgrade_clicked', { current_plan, target_plan })
    )
  }
}

export function capturePageview(pathname: string) {
  if (typeof window === 'undefined') return
  void withPosthog((posthog) =>
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      surface: getPageSurface(pathname)
    })
  )
}

export function identifyUser(user: {
  id: string
  email?: string | null
  name?: string | null
  role?: string | null
}) {
  void withPosthog((posthog) => {
    const previousId = posthog.get_distinct_id()
    if (previousId.startsWith('waitlist:') && previousId !== user.id) {
      posthog.alias(user.id, previousId)
    }
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role
    })
  })
}

export function resetAnalytics() {
  void withPosthog((posthog) => posthog.reset())
}
