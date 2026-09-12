import { auth } from '@findsports_oficial/auth'
import { createMiddleware } from '@tanstack/react-start'

export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers
      })
      return next({
        context: { session }
      })
    } catch {
      // A session lookup failure must not prevent public routes from rendering.
      // Protected routes still fail closed because the guard receives null.
      console.error(JSON.stringify({ event: 'session_lookup_failed' }))
      return next({ context: { session: null } })
    }
  }
)
