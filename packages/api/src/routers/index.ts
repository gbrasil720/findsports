import { protectedProcedure, publicProcedure, router } from '../index'
import { adminBarsRouter } from './admin-bars'
import { adminUsersRouter } from './admin-users'
import { appConfigRouter } from './app-config'
import { attendanceRouter } from './attendance'
import { barReservationsRouter } from './bar-reservations'
import { commercialAnalyticsRouter } from './commercial-analytics'
import { onboardingRouter } from './onboarding'
import { pubRouter } from './pub'
import { pubsRouter } from './pubs'
import { ratingsRouter } from './ratings'
import { recommendationsRouter } from './recommendations'
import { reservationValidationRouter } from './reservation-validation'
import { reservationsRouter } from './reservations'

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return 'OK'
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: 'This is private',
      user: ctx.session.user
    }
  }),
  adminBars: adminBarsRouter,
  adminUsers: adminUsersRouter,
  appConfig: appConfigRouter,
  onboarding: onboardingRouter,
  pub: pubRouter,
  pubs: pubsRouter,
  recommendations: recommendationsRouter,
  commercialAnalytics: commercialAnalyticsRouter,
  ratings: ratingsRouter,
  reservationValidation: reservationValidationRouter,
  reservations: reservationsRouter,
  barReservations: barReservationsRouter,
  attendance: attendanceRouter
})
export type AppRouter = typeof appRouter
