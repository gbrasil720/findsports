import posthog from 'posthog-js'

export const analytics = {
  // Landing
  landingViewed: () => posthog.capture('landing_viewed'),

  landingCtaClicked: (cta: string) =>
    posthog.capture('landing_cta_clicked', { cta }),

  waitlistSubmitted: (role: 'fan' | 'pub') =>
    posthog.capture('waitlist_submitted', { role }),

  // Auth
  signupStarted: () => posthog.capture('signup_started'),

  signupCompleted: (role: 'fan' | 'pub') =>
    posthog.capture('signup_completed', { role }),

  signinCompleted: () => posthog.capture('signin_completed'),

  signout: () => posthog.capture('signout'),

  // Onboarding Fan
  fanOnboardingStarted: () => posthog.capture('fan_onboarding_started'),

  fanOnboardingStepCompleted: (step: number) =>
    posthog.capture('fan_onboarding_step_completed', { step }),

  fanOnboardingSportsSelected: (sports: string[]) =>
    posthog.capture('fan_onboarding_sports_selected', {
      sports,
      count: sports.length
    }),

  fanOnboardingRadiusSelected: (radius_km: number) =>
    posthog.capture('fan_onboarding_radius_selected', { radius_km }),

  fanOnboardingCompleted: (sports: string[], radius_km: number) =>
    posthog.capture('fan_onboarding_completed', { sports, radius_km }),

  // Onboarding Bar
  pubOnboardingStarted: () => posthog.capture('pub_onboarding_started'),

  pubOnboardingStepCompleted: (step: number) =>
    posthog.capture('pub_onboarding_step_completed', { step }),

  pubOnboardingCompleted: () => posthog.capture('pub_onboarding_completed'),

  planPageViewed: () => posthog.capture('plan_page_viewed'),

  planSelected: (plan: 'starter' | 'pro' | 'elite') =>
    posthog.capture('plan_selected', { plan }),

  checkoutStarted: (plan: 'starter' | 'pro' | 'elite') =>
    posthog.capture('checkout_started', { plan }),

  // Dashboard Fan
  dashboardViewed: () => posthog.capture('dashboard_viewed'),

  searchPerformed: (params: {
    query?: string
    sportId?: string
    radius_km?: number
    results_count: number
  }) => posthog.capture('search_performed', params),

  searchFilterApplied: (filter_type: string, value: unknown) =>
    posthog.capture('search_filter_applied', { filter_type, value }),

  barCardClicked: (bar_id: string, bar_plan: 'starter' | 'pro' | 'elite') =>
    posthog.capture('bar_card_clicked', { bar_id, bar_plan }),

  barMapPinClicked: (bar_id: string) =>
    posthog.capture('bar_map_pin_clicked', { bar_id }),

  barFavorited: (bar_id: string) =>
    posthog.capture('bar_favorited', { bar_id }),

  barUnfavorited: (bar_id: string) =>
    posthog.capture('bar_unfavorited', { bar_id }),

  directionsOpened: (bar_id: string) =>
    posthog.capture('directions_opened', { bar_id }),

  barShared: (bar_id: string) => posthog.capture('bar_shared', { bar_id }),

  // Perfil Fan
  profileViewed: () => posthog.capture('profile_viewed'),

  profileNameUpdated: () => posthog.capture('profile_name_updated'),

  profileSportsUpdated: (sports: string[]) =>
    posthog.capture('profile_sports_updated', { sports, count: sports.length }),

  profileRadiusUpdated: (radius_km: number) =>
    posthog.capture('profile_radius_updated', { radius_km }),

  favoritesTabViewed: () => posthog.capture('favorites_tab_viewed'),

  settingsTabViewed: () => posthog.capture('settings_tab_viewed'),

  // Painel Bar
  adminViewed: () => posthog.capture('admin_viewed'),

  eventCreated: (params: {
    championship: string
    sport: string
    has_teams: boolean
  }) => posthog.capture('event_created', params),

  eventUpdated: (event_id: string) =>
    posthog.capture('event_updated', { event_id }),

  eventDeleted: (event_id: string) =>
    posthog.capture('event_deleted', { event_id }),

  barProfileUpdated: (fields: string[]) =>
    posthog.capture('bar_profile_updated', { fields }),

  barPhotoUploaded: () => posthog.capture('bar_photo_uploaded'),

  previewSectionViewed: () => posthog.capture('preview_section_viewed'),

  billingPageViewed: () => posthog.capture('billing_page_viewed'),

  portalOpened: () => posthog.capture('portal_opened'),

  upgradeClicked: (current_plan: string, target_plan: string) =>
    posthog.capture('upgrade_clicked', { current_plan, target_plan }),

  // Erros e edge cases
  eventLimitReached: () => posthog.capture('event_limit_reached'),

  barInactiveWarningShown: () => posthog.capture('bar_inactive_warning_shown'),

  geocodingFailed: (address: string) =>
    posthog.capture('geocoding_failed', { address })
}
