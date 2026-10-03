import 'dotenv/config'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const rawEnv = createEnv({
  server: {
    // No Worker o banco vem do binding Hyperdrive, não daqui (WEB-201). Onde
    // ela é necessária, `resolveDatabaseUrl` recusa a falta no primeiro uso.
    DATABASE_URL: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    PUBLIC_APP_URL: z.url().optional(),
    CORS_ORIGIN: z.url(),
    AUTH_DEV_TRUSTED_ORIGIN: z.url().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.email().optional(),
    BLOB_STORE_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/, 'BLOB_STORE_ID inválido')
      .optional(),
    /**
     * Fotos de bar e avatares no bucket R2 `onside-media` (WEB-202). O
     * servidor assina um PUT com a chave S3 do bucket e o navegador sobe
     * direto; a leitura sai de `MEDIA_PUBLIC_ORIGIN`.
     *
     * Opcionais, como a LocationIQ: faltando, só o upload de foto para, com
     * mensagem própria — o deploy pode chegar antes das variáveis.
     */
    R2_MEDIA_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_MEDIA_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // Vira subdomínio da URL de upload: só letra e dígito.
    CF_ACCOUNT_ID: z
      .string()
      .regex(/^[a-zA-Z0-9]+$/, 'CF_ACCOUNT_ID inválido')
      .optional(),
    MEDIA_PUBLIC_ORIGIN: z.url({ protocol: /^https$/ }).optional(),
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
    /**
     * Segredo que a Vercel manda em `Authorization: Bearer` ao disparar os
     * crons (WEB-117). Faltando, a rota de cron recusa toda chamada — nunca
     * roda aberta.
     */
    CRON_SECRET: z.string().min(16).optional(),
    /**
     * Chaves só do E2E (WEB-174, `docs/e2e.md`). Recusadas em produção logo
     * abaixo: qualquer uma delas troca um serviço real por um dublê.
     *
     * `E2E_EMAIL_OUTBOX`: arquivo JSONL onde os e-mails são gravados em vez
     * de ir para a Resend. `E2E_DISABLE_CACHES=1`: zera os caches de servidor
     * (TTL e cookie de sessão). `LOCATIONIQ_BASE_URL`: stub do geocoding.
     */
    E2E_EMAIL_OUTBOX: z.string().min(1).optional(),
    E2E_DISABLE_CACHES: z.literal('1').optional(),
    LOCATIONIQ_BASE_URL: z.url().optional(),
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

// Lidas do `process.env` cru, porque o resolver do banco não importa este
// módulo. A recusa vale para todas, inclusive as que não estão no esquema.
const TEST_ONLY_ENV_KEYS = [
  'E2E_DATABASE_URL',
  'E2E_EMAIL_OUTBOX',
  'E2E_DISABLE_CACHES',
  'LOCATIONIQ_BASE_URL'
]

if (rawEnv.NODE_ENV === 'production') {
  const set = TEST_ONLY_ENV_KEYS.filter((key) => process.env[key])
  if (set.length > 0) {
    throw new Error(
      `Variáveis só de E2E recusadas em produção: ${set.join(', ')}.`
    )
  }
}

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  'localhost.',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]'
])

export function resolvePublicAppUrl(
  publicAppUrl: string | undefined,
  betterAuthUrl: string,
  nodeEnv: 'development' | 'production' | 'test'
): string {
  if (nodeEnv === 'production') {
    if (!publicAppUrl) {
      throw new Error('PUBLIC_APP_URL é obrigatória em produção.')
    }

    const url = new URL(publicAppUrl)
    if (url.protocol !== 'https:' || LOCAL_HOSTNAMES.has(url.hostname)) {
      throw new Error(
        'PUBLIC_APP_URL deve apontar para um endereço HTTPS público em produção.'
      )
    }
  }

  return publicAppUrl ?? betterAuthUrl
}

export const env = rawEnv

export function getPublicAppUrl(): string {
  return resolvePublicAppUrl(
    rawEnv.PUBLIC_APP_URL,
    rawEnv.BETTER_AUTH_URL,
    rawEnv.NODE_ENV
  )
}
