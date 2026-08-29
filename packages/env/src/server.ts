import 'dotenv/config'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    AUTH_DEV_TRUSTED_ORIGIN: z.url().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.email().optional(),
    BLOB_STORE_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/, 'BLOB_STORE_ID inválido')
      .optional(),
    LAUNCH_ADMISSION_MODE: z
      .enum(['open', 'invite-only'])
      .default('invite-only'),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development')
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
})
