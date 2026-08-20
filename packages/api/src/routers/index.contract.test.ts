import { describe, expect, expectTypeOf, it } from 'bun:test'
import { appRouter } from './index'

describe('router contract', () => {
  it('exposes commercialAnalytics (not legacy analytics)', () => {
    expectTypeOf(appRouter).toHaveProperty('commercialAnalytics')
    // Legacy key must not exist
    expect('analytics' in appRouter).toBe(false)
  })

  it('commercialAnalytics exposes recordCommercialEvent', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'recordCommercialEvent'
    )
  })

  it('commercialAnalytics exposes getMyAnalyticsOverview', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'getMyAnalyticsOverview'
    )
  })

  it('commercialAnalytics exposes getMyEventAnalytics', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'getMyEventAnalytics'
    )
  })

  it('commercialAnalytics exposes getMyEntitlements', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'getMyEntitlements'
    )
  })

  it('commercialAnalytics exposes canViewEventType', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'canViewEventType'
    )
  })

  it('commercialAnalytics exposes cleanupRetention', () => {
    expectTypeOf(appRouter.commercialAnalytics).toHaveProperty(
      'cleanupRetention'
    )
  })

  it('router exposes pub', () => {
    expectTypeOf(appRouter).toHaveProperty('pub')
  })

  it('router exposes waitlist', () => {
    expectTypeOf(appRouter).toHaveProperty('waitlist')
  })

  it('recommendations exposes the personalized read and feedback controls', () => {
    expectTypeOf(appRouter).toHaveProperty('recommendations')
    expectTypeOf(appRouter.recommendations).toHaveProperty('get')
    expectTypeOf(appRouter.recommendations).toHaveProperty('dismiss')
    expectTypeOf(appRouter.recommendations).toHaveProperty('reset')
  })
})
