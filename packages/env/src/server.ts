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
    /**
     * Geocoding do cadastro de bar (WEB-73). Era `GOOGLE_MAPS_API_KEY`, um
     * SKU faturado que parou de responder quando o trial do Google Cloud
     * acabou; agora é a LocationIQ, cujo tier grátis (5.000/dia) cobre o
     * volume com folga — geocoding só roda em `createPub` e no `update` com
     * endereço alterado.
     *
     * Opcional no esquema, como as outras: faltando, só o cadastro de bar
     * para, com mensagem própria. Obrigatória aqui derrubaria o app inteiro.
     */
    LOCATIONIQ_API_KEY: z.string().min(1).optional(),
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
