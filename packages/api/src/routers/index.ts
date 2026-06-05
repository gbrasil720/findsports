import { protectedProcedure, publicProcedure, router } from '../index'
import { onboardingRouter } from './onboarding'
import { pubRouter } from './pub'
import { pubsRouter } from './pubs'

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
  waitlist: waitlistRouter,
  onboarding: onboardingRouter,
  pub: pubRouter,
  pubs: pubsRouter
})
export type AppRouter = typeof appRouter
