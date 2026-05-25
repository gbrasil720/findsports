import { protectedProcedure, publicProcedure, router } from '../index'

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
  waitlist: waitlistRouter
})
export type AppRouter = typeof appRouter
