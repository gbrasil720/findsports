import { protectedProcedure, publicProcedure, router } from '../index'
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
import { waitlistRouter } from './waitlist'

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
  adminUsers: adminUsersRouter,
  appConfig: appConfigRouter,
  waitlist: waitlistRouter,
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
