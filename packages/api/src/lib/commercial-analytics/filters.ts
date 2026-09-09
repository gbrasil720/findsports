import type {
  AnalyticsEntitlements,
  AnalyticsOverview,
  AnalyticsOverviewResponse
} from './types'

/**
 * Shapes the raw overview into what the pub's plan is allowed to see.
 *
 * The response is built explicitly, field by field, instead of spreading the
 * raw overview and overriding a few keys. A spread is what let the previous
 * period metrics of the core KPIs (uniqueVisitorsPrev, interestedPeoplePrev,
 * highIntentActionsPrev, profileViewsPrev + their `*Change`) leak to plans
 * that were blocked from comparison, contradicting `getMyEntitlements`.
 *
 * Gating rules:
 * - current-period core KPIs: `canViewAnalytics`
 * - current-period channel metrics: the channel entitlement
 * - comparison fields: `canViewComparison`, plus the channel entitlement for
 *   channel-specific comparisons (you can't compare what you can't see)
 * - daily series: `canViewDailyBreakdown`, plus the channel entitlement
 */
export function applyOverviewEntitlements(
  overview: AnalyticsOverview,
  e: AnalyticsEntitlements
): AnalyticsOverviewResponse {
  return {
    uniqueVisitors: overview.uniqueVisitors,
    interestedPeople: overview.interestedPeople,
    highIntentActions: overview.highIntentActions,
    profileViews: overview.profileViews,

    directionsOpened: e.canViewDirectionsOpened
      ? overview.directionsOpened
      : null,
    phoneClicked: e.canViewPhoneClicked ? overview.phoneClicked : null,
    whatsappOpened: e.canViewWhatsappOpened ? overview.whatsappOpened : null,

    uniqueVisitorsPrev: e.canViewComparison
      ? overview.uniqueVisitorsPrev
      : null,
    interestedPeoplePrev: e.canViewComparison
      ? overview.interestedPeoplePrev
      : null,
    highIntentActionsPrev: e.canViewComparison
      ? overview.highIntentActionsPrev
      : null,
    profileViewsPrev: e.canViewComparison ? overview.profileViewsPrev : null,
    directionsOpenedPrev:
      e.canViewComparison && e.canViewDirectionsOpened
        ? overview.directionsOpenedPrev
        : null,
    phoneClickedPrev:
      e.canViewComparison && e.canViewPhoneClicked
        ? overview.phoneClickedPrev
        : null,
    whatsappOpenedPrev:
      e.canViewComparison && e.canViewWhatsappOpened
        ? overview.whatsappOpenedPrev
        : null,

    uniqueVisitorsChange: e.canViewComparison
      ? overview.uniqueVisitorsChange
      : null,
    interestedPeopleChange: e.canViewComparison
      ? overview.interestedPeopleChange
      : null,
    highIntentActionsChange: e.canViewComparison
      ? overview.highIntentActionsChange
      : null,
    profileViewsChange: e.canViewComparison
      ? overview.profileViewsChange
      : null,
    directionsOpenedChange:
      e.canViewComparison && e.canViewDirectionsOpened
        ? overview.directionsOpenedChange
        : null,
    phoneClickedChange:
      e.canViewComparison && e.canViewPhoneClicked
        ? overview.phoneClickedChange
        : null,
    whatsappOpenedChange:
      e.canViewComparison && e.canViewWhatsappOpened
        ? overview.whatsappOpenedChange
        : null,

    dailyProfileViews: e.canViewDailyBreakdown
      ? overview.dailyProfileViews
      : null,
    dailyDirectionsOpened:
      e.canViewDailyBreakdown && e.canViewDirectionsOpened
        ? overview.dailyDirectionsOpened
        : null,
    dailyPhoneClicked:
      e.canViewDailyBreakdown && e.canViewPhoneClicked
        ? overview.dailyPhoneClicked
        : null,
    dailyWhatsappOpened:
      e.canViewDailyBreakdown && e.canViewWhatsappOpened
        ? overview.dailyWhatsappOpened
        : null,

    from: overview.from,
    to: overview.to,
    limitations: overview.limitations
  }
}
