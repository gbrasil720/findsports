import { getPageSurface } from './page-surface'
import { withPosthog } from './posthog'

export type UserRole = 'fan' | 'pub'
export type BarPlan = 'starter' | 'pro' | 'elite'
export type BarOpenSource = 'card' | 'map'
export type BarIntentAction = 'directions' | 'whatsapp' | 'phone' | 'favorite'
/** Onde o convite de instalação apareceu, e em que plataforma. */
export type InstallSurface = 'dashboard' | 'admin'
export type InstallPlatform = 'android' | 'ios'
export type { PageSurface } from './page-surface'

/**
 * Product analytics — only events that answer an internal usage question.
 * Pageviews stay on `$pageview` (with `surface`). Autocapture is off.
 */
export const analytics = {
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

  /**
   * A tela de recibo (WEB-59) atravessa a janela entre o redirect do provedor
   * e o webhook `onSubscriptionActive`. Os dois eventos juntos respondem se a
   * janela é curta o bastante: quantas assinaturas confirmam ali mesmo e
   * quantas estouram o teto e caem na saída de demora — com quantos segundos
   * de espera, que é o número que decide se o teto está no lugar certo.
   */
  subscriptionConfirmed: (plan: BarPlan) => {
    void withPosthog((posthog) =>
      posthog.capture('subscription_confirmed', { plan })
    )
  },

  subscriptionConfirmationDelayed: (waited_seconds: number) => {
    void withPosthog((posthog) =>
      posthog.capture('subscription_confirmation_delayed', { waited_seconds })
    )
  },

  upgradeClicked: (current_plan: string, target_plan: string) => {
    void withPosthog((posthog) =>
      posthog.capture('upgrade_clicked', { current_plan, target_plan })
    )
  },

  /**
   * Convite de instalação do PWA (WEB-72). Os três eventos juntos respondem a
   * pergunta que decide se o convite fica: de cada exibição, quantos instalam
   * e quantos dispensam. Sem o `dismissed`, um convite que só incomoda parece
   * idêntico a um que ninguém viu.
   */
  installPromptShown: (platform: InstallPlatform, surface: InstallSurface) => {
    void withPosthog((posthog) =>
      posthog.capture('install_prompt_shown', { platform, surface })
    )
  },

  installAccepted: (platform: InstallPlatform, surface: InstallSurface) => {
    void withPosthog((posthog) =>
      posthog.capture('install_accepted', { platform, surface })
    )
  },

  installDismissed: (platform: InstallPlatform, surface: InstallSurface) => {
    void withPosthog((posthog) =>
      posthog.capture('install_dismissed', { platform, surface })
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

/**
 * Só o id opaco e o papel: nome, e-mail, telefone e cidade nunca vão ao
 * PostHog (specs/landing-copy-conversion.md §9.1).
 */
export function identifyUser(user: { id: string; role?: string | null }) {
  void withPosthog((posthog) => posthog.identify(user.id, { role: user.role }))
}

export function resetAnalytics() {
  void withPosthog((posthog) => posthog.reset())
}
