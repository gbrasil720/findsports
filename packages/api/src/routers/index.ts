import { protectedProcedure, publicProcedure, router } from '../index'
import { achievementsRouter } from './achievements'
import { adminBarsRouter } from './admin-bars'
import { adminEventsRouter } from './admin-events'
import { adminUsersRouter } from './admin-users'
import { appConfigRouter } from './app-config'
import { attendanceRouter } from './attendance'
import { barReservationsRouter } from './bar-reservations'
import { bastidoresRouter } from './bastidores'
import { commercialAnalyticsRouter } from './commercial-analytics'
import { feedbackRouter } from './feedback'
import { grimorioRouter } from './grimorio'
import { houdiniRouter } from './houdini'
import { onboardingRouter } from './onboarding'
import { pubRouter } from './pub'
import { pubsRouter } from './pubs'
import { ratingsRouter } from './ratings'
import { recommendationsRouter } from './recommendations'
import { reservationValidationRouter } from './reservation-validation'

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
  adminEvents: adminEventsRouter,
  adminUsers: adminUsersRouter,
  appConfig: appConfigRouter,
  bastidores: bastidoresRouter,
  onboarding: onboardingRouter,
  pub: pubRouter,
  pubs: pubsRouter,
  recommendations: recommendationsRouter,
  commercialAnalytics: commercialAnalyticsRouter,
  ratings: ratingsRouter,
  reservationValidation: reservationValidationRouter,
  barReservations: barReservationsRouter,
  attendance: attendanceRouter,
  achievements: achievementsRouter,
  feedback: feedbackRouter,
  grimorio: grimorioRouter,
  houdini: houdiniRouter
})
export type AppRouter = typeof appRouter
