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
    AUTH_DEV_TRUSTED_ORIGIN: z.url().optional(),
    /**
     * Envio de e-mail (WEB-476): qualquer API no formato da Resend
     * (`POST <EMAIL_API_URL>/emails`, Bearer). A Resend é o padrão; a
     * MillionSend é a mesma API em `https://api.millionsend.com`. Os nomes
     * antigos (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) valem enquanto os
     * segredos não forem trocados: ver `runtimeEnv` abaixo.
     */
    EMAIL_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.email().optional(),
    // https: a chave vai no cabeçalho de cada envio.
    EMAIL_API_URL: z
      .url({ protocol: /^https$/ })
      .default('https://api.resend.com'),
    /**
     * `console`: o e-mail vai para o log (com o link, que é como se testa)
     * e conta como entregue, mesmo com `EMAIL_API_KEY`. Só para o Worker de
     * preview, cujo banco é cópia de produção com e-mails reais. Sem ela,
     * produção sem chave de e-mail continua falhando alto.
     */
    EMAIL_DELIVERY: z.literal('console').optional(),
    /**
     * Cobrança pelo Stripe (WEB-31). O modo vem da própria chave: `_test_` é o
     * sandbox, `_live_` cobra de verdade — por isso a chave viva é recusada
     * fora do domínio de produção, logo abaixo. Aceita a chave secreta padrão
     * (`sk_`) e a restrita (`rk_`), que é a de produção.
     *
     * Opcionais, como a LocationIQ: faltando, só a cobrança para (checkout,
     * portal e webhook respondem erro) e o resto do app sobe.
     */
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^(sk|rk)_(test|live)_/, 'STRIPE_SECRET_KEY inválida')
      .optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
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
     * Cloudflare Turnstile no cadastro, na recuperação de senha e no reenvio
     * da verificação. Ausente, a verificação no servidor fica
     * desligada (um log no boot de produção): o deploy pode chegar antes do
     * segredo. Presente, o token passa a ser obrigatório — então a site key
     * (`VITE_TURNSTILE_SITE_KEY`) precisa estar no build ANTES deste segredo.
     */
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    /**
     * AI Gateway por onde passa toda chamada de IA (WEB-424): `onside-prod`
     * e `onside-preview`, no `wrangler.jsonc`, com teto de gasto e logs.
     * Ausente em produção, a IA não chama ninguém: sem Gateway não há teto.
     * No `vite dev` vale o `default` da conta.
     */
    AI_GATEWAY_ID: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'AI_GATEWAY_ID inválido')
      .optional(),
    /**
     * Chaves só do E2E (WEB-174, `docs/e2e.md`). Recusadas em produção logo
     * abaixo: qualquer uma delas troca um serviço real por um dublê.
     *
     * `E2E_EMAIL_OUTBOX`: arquivo JSONL onde os e-mails são gravados em vez
     * de ir para a API de e-mail. `E2E_DISABLE_CACHES=1`: zera os caches de servidor
     * (TTL e cookie de sessão). `LOCATIONIQ_BASE_URL`: stub do geocoding.
     * `STRIPE_API_BASE_URL`: stub da API do Stripe.
     */
    E2E_EMAIL_OUTBOX: z.string().min(1).optional(),
    E2E_DISABLE_CACHES: z.literal('1').optional(),
    LOCATIONIQ_BASE_URL: z.url().optional(),
    STRIPE_API_BASE_URL: z.url().optional(),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development')
  },
  runtimeEnv: {
    ...process.env,
    // Nomes antigos, de antes do WEB-476: o novo vence, vazio cai no antigo.
    EMAIL_API_KEY: process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL
  },
  emptyStringAsUndefined: true
})

// Lidas do `process.env` cru, porque o resolver do banco não importa este
// módulo. A recusa vale para todas, inclusive as que não estão no esquema.
const TEST_ONLY_ENV_KEYS = [
  'E2E_DATABASE_URL',
  'E2E_EMAIL_OUTBOX',
  'E2E_DISABLE_CACHES',
  'LOCATIONIQ_BASE_URL',
  'STRIPE_API_BASE_URL'
]

if (rawEnv.NODE_ENV === 'production') {
  const set = TEST_ONLY_ENV_KEYS.filter((key) => process.env[key])
  if (set.length > 0) {
    throw new Error(
      `Variáveis só de E2E recusadas em produção: ${set.join(', ')}.`
    )
  }
}

// O preview também roda com NODE_ENV=production; o que o separa de produção é
// o domínio. Lá o console engoliria e-mail de verdade e logaria tokens.
if (
  rawEnv.EMAIL_DELIVERY === 'console' &&
  rawEnv.PUBLIC_APP_URL &&
  /(^|\.)onside\.sh$/.test(new URL(rawEnv.PUBLIC_APP_URL).hostname)
) {
  throw new Error('EMAIL_DELIVERY=console recusada no domínio de produção.')
}

// O preview e o `vite dev` não podem cobrar cartão de verdade: chave viva do
// Stripe só no domínio de produção.
if (
  rawEnv.STRIPE_SECRET_KEY &&
  /^(sk|rk)_live_/.test(rawEnv.STRIPE_SECRET_KEY)
) {
  const host = new URL(rawEnv.PUBLIC_APP_URL ?? rawEnv.BETTER_AUTH_URL).hostname
  if (!/(^|\.)onside\.sh$/.test(host)) {
    throw new Error(
      'STRIPE_SECRET_KEY viva recusada fora do domínio de produção.'
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
