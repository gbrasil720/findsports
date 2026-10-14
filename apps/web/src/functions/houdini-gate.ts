import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { decideHoudiniGate } from '@/lib/houdini-gate'
import { authMiddleware } from '@/middleware/auth'

export type { HoudiniEnv, HoudiniGate } from '@/lib/houdini-gate'

/** WEB-383: o portão do Houdini, decidido no servidor (ver `lib/houdini-gate`). */
export const getHoudiniGate = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    decideHoudiniGate(new URL(getRequest().url), context.session)
  )
