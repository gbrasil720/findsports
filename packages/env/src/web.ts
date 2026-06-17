import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_POSTHOG_PROJECT_TOKEN: z.string().min(1),
    VITE_POSTHOG_HOST: z.url()
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true
})
