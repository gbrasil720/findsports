import {
  checkout,
  dodopayments,
  portal,
  webhooks
} from '@dodopayments/better-auth'
import { and, createHttpDb, db, eq } from '@findsports_oficial/db'
import * as schema from '@findsports_oficial/db/schema/auth'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { waitUntil } from '@vercel/functions'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx
} from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import DodoPayments from 'dodopayments'
import { isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getBarAccountDeletionBlock } from './account-deletion-policy'
import { canAccessPubBilling, requiresPubBillingAccess } from './billing-access'
import { isSafeUserImage } from './session-image'
import { buildTrustedOrigins } from './trusted-origins'
import { sendVerificationEmailWithResend } from './verification-email'

function cookieDomainFor(baseUrl: string): string | undefined {
  const host = new URL(baseUrl).hostname.replace(/^www\./, '')
  if (host === 'onside.sh' || host === 'findsports.com.br') return host
  return undefined
}

export const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode'
})

const PLAN_BY_PRODUCT: Record<string, 'starter' | 'pro' | 'elite'> = {
  pdt_0NgxgZyV3AKsNe99Ae2ZN: 'starter',
  pdt_0NgxglMLDZdpaXIuRAiCE: 'pro',
  pdt_0NgxgzP6hnGWg1brokOcU: 'elite'
}

// Busca o bar pelo email do customer no payload
async function getBarByCustomer(
  email: string,
  dodoCustomerId: string | undefined
) {
  let foundUser = dodoCustomerId
    ? await db.query.user.findFirst({
        where: eq(user.dodoCustomerId, dodoCustomerId)
      })
    : null
  if (!foundUser) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, email)
    })
    if (!byEmail?.emailVerified) return null
    if (
      dodoCustomerId &&
      byEmail?.dodoCustomerId &&
      byEmail.dodoCustomerId !== dodoCustomerId
    ) {
      return null
    }
    foundUser = byEmail
    if (foundUser && dodoCustomerId && !foundUser.dodoCustomerId) {
      await db
        .update(user)
        .set({ dodoCustomerId })
        .where(and(eq(user.id, foundUser.id), isNull(user.dodoCustomerId)))
    }
  }
  if (!foundUser?.emailVerified) return null

  return db.query.bar.findFirst({
    where: eq(bar.userId, foundUser.id)
  })
}

async function handleSubscriptionActivated(payload: any) {
  const data = payload.data ?? payload
  const email = data?.customer?.email
  const customerId = data?.customer?.customer_id ?? data?.customer_id
  const dodoSubId = data?.subscription_id
  const productId = data?.product_id
  const plan = productId ? PLAN_BY_PRODUCT[productId] : 'starter'

  if (!email || !dodoSubId) return

  const foundBar = await getBarByCustomer(email, customerId)
  if (!foundBar) return

  // Verifica se já existe subscription para esse bar
  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.barId, foundBar.id)
  })

  if (existing) {
    // Atualiza a subscription existente
    await db
      .update(subscription)
      .set({
        status: 'active',
        plan: plan ?? 'starter',
        dodoSubscriptionId: dodoSubId,
        currentPeriodEnd: data?.next_billing_date
          ? new Date(data.next_billing_date)
          : undefined
      })
      .where(eq(subscription.barId, foundBar.id))
  } else {
    // Cria nova subscription
    await db.insert(subscription).values({
      barId: foundBar.id,
      status: 'active',
      plan: plan ?? 'starter',
      dodoSubscriptionId: dodoSubId,
      currentPeriodEnd: data?.next_billing_date
        ? new Date(data.next_billing_date)
        : undefined
    })
  }

  // Ativa o bar
  await db.update(bar).set({ isActive: true }).where(eq(bar.id, foundBar.id))
}

async function handleSubscriptionOnHold(payload: any) {
  const data = payload.data ?? payload
  const dodoSubId = data?.subscription_id
  if (!dodoSubId) return

  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.dodoSubscriptionId, dodoSubId)
  })
  if (!existing) return

  await db
    .update(subscription)
    .set({ status: 'past_due' })
    .where(eq(subscription.barId, existing.barId))
  // Janela de 5 dias — bar continua ativo até subscription.cancelled
}

async function handleSubscriptionCancelled(payload: any) {
  const data = payload.data ?? payload
  const dodoSubId = data?.subscription_id
  if (!dodoSubId) return

  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.dodoSubscriptionId, dodoSubId)
  })
  if (!existing) return

  await db
    .update(subscription)
    .set({ status: 'inactive' })
    .where(eq(subscription.barId, existing.barId))

  await db
    .update(bar)
    .set({ isActive: false })
    .where(eq(bar.id, existing.barId))
}

export function createAuth() {
  const db = createHttpDb()
  const cookieDomain = cookieDomainFor(env.BETTER_AUTH_URL)

  return betterAuth({
    appName: 'Onside',
    advanced: {
      backgroundTasks: { handler: waitUntil },
      ...(cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain
            }
          }
        : {})
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/update-user') {
          const image = (ctx.body as { image?: unknown } | undefined)?.image
          if (image !== undefined && !isSafeUserImage(image)) {
            throw new APIError('BAD_REQUEST', {
              message:
                'A foto precisa ser uma URL https curta, não um arquivo embutido.'
            })
          }
        }
        if (!requiresPubBillingAccess(ctx.path)) return
        const session = await getSessionFromCtx(ctx)
        if (!canAccessPubBilling(session?.user ?? null)) {
          throw new APIError('FORBIDDEN', {
            message:
              'Apenas bares com e-mail verificado podem acessar cobrança.'
          })
        }
      })
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: schema
    }),
    trustedOrigins: buildTrustedOrigins({
      baseUrl: env.BETTER_AUTH_URL,
      nodeEnv: env.NODE_ENV,
      developmentOrigin: env.AUTH_DEV_TRUSTED_ORIGIN
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: 'fan',
        banned: false,
        banReason: null,
        banExpires: null,
        twoFactorEnabled: false,
        dodoCustomerId: null,
        ...additionalFields,
        id
      })
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmailWithResend({
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.RESEND_FROM_EMAIL,
          to: user.email,
          name: user.name,
          verificationUrl: url,
          logoUrl: new URL(
            '/onside-wordmark-paper.png',
            env.BETTER_AUTH_URL
          ).toString(),
          heroImageUrl: new URL('/og-image.jpg', env.BETTER_AUTH_URL).toString()
        })
      }
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (accountUser) => {
          const accountBar = await db.query.bar.findFirst({
            where: eq(bar.userId, accountUser.id),
            with: { subscription: true }
          })
          const block = getBarAccountDeletionBlock(
            accountBar?.subscription ?? null
          )
          if (block) {
            throw new APIError('BAD_REQUEST', {
              message:
                block === 'period-active'
                  ? 'A assinatura foi cancelada, mas o período contratado ainda está vigente.'
                  : 'Encerre a assinatura vigente antes de excluir a conta do bar.'
            })
          }
        }
      },
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'fan',
          input: true
        },
        onboardingCompleted: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false
        },
        admittedAt: {
          type: 'date',
          required: false,
          input: false
        },
        searchRadiusKm: {
          type: 'number',
          required: false,
          defaultValue: 3,
          input: true
        }
      }
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: {
      // ESC-11: o padrão guarda o contador num Map em memória do processo.
      // Em serverless cada instância tem o seu, e ele some entre invocações,
      // então login e cadastro ficavam abertos a força bruta na prática.
      // No Postgres o contador passa a ser compartilhado.
      //
      // As regras não foram mexidas: o better-auth já aplica 3 tentativas por
      // 10s em sign-in, sign-up, troca de senha e de e-mail, e janelas mais
      // longas nos envios de e-mail. Sobrescrever isso com uma regra própria
      // SUBSTITUIRIA a padrão, e afrouxaria o que já estava certo.
      //
      // Ligado explicitamente: a proteção não deve depender de NODE_ENV.
      enabled: true,
      storage: 'database'
    },
    session: {
      // ESC-02: sem isto, toda requisição tRPC, toda navegação SSR e toda
      // rota REST fazia um SELECT em `session` + `user`. O cache guarda a
      // sessão num cookie assinado, e a leitura passa a ser local.
      //
      // maxAge curto de propósito: enquanto o cookie é válido, mudanças
      // feitas por um admin sobre OUTRO usuário (banir, trocar papel) não
      // têm como invalidá-lo, então essa é a janela máxima de propagação.
      // 60s já captura praticamente todas as rajadas de requisições de um
      // carregamento de página, que é de onde vem o ganho.
      //
      // Mutações que o próprio usuário faz sobre a própria sessão são
      // seguras: `authClient.updateUser` e a impersonação do plugin admin
      // passam por `setSessionCookie`, que reescreve este cache. A exceção
      // é o onboarding, que atualiza `user` direto pelo Drizzle — por isso
      // as rotas de onboarding chamam `refreshSessionCache()` no sucesso.
      cookieCache: {
        enabled: true,
        maxAge: 60,
        // v2: fotos deixam de ir no cookie (eram data URL de ~25 KB e
        // estouravam o header na Vercel — 494 REQUEST_HEADER_TOO_LARGE).
        version: '2'
      }
    },
    plugins: [
      tanstackStartCookies(),
      twoFactor({ issuer: 'Onside' }),
      admin({
        adminRoles: ['admin'],
        defaultRole: 'fan'
      }),
      // The admin() plugin above redefines `role` with `input: false`, which
      // blocks clients from setting it at signup (error: "role is not
      // allowed to be set"). Since plugin schemas merge in array order and
      // later entries win, this plugin re-enables input but restricts the
      // accepted values to non-privileged roles, preventing signup from
      // self-escalating to `admin`.
      {
        id: 'allow-role-on-signup',
        schema: {
          user: {
            fields: {
              role: {
                type: 'string',
                required: false,
                defaultValue: 'fan',
                input: true,
                validator: { input: z.enum(['fan', 'pub']) }
              }
            }
          }
        }
      },
      dodopayments({
        client: dodoClient,
        // MVP launches with payments disabled (single bar, manually set to
        // pro plan). Disabled so signup doesn't depend on a working Dodo
        // API key/environment.
        createCustomerOnSignUp: false,
        use: [
          checkout({
            products: [
              { productId: 'pdt_0NgxgZyV3AKsNe99Ae2ZN', slug: 'starter' },
              { productId: 'pdt_0NgxglMLDZdpaXIuRAiCE', slug: 'pro' },
              { productId: 'pdt_0NgxgzP6hnGWg1brokOcU', slug: 'elite' }
            ],
            successUrl: '/admin',
            authenticatedUsersOnly: true
          }),
          portal(),
          webhooks({
            webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
            onSubscriptionActive: handleSubscriptionActivated,
            onSubscriptionRenewed: handleSubscriptionActivated,
            onSubscriptionOnHold: handleSubscriptionOnHold,
            onSubscriptionFailed: handleSubscriptionOnHold,
            onSubscriptionCancelled: handleSubscriptionCancelled
          })
        ]
      })
    ]
  })
}

export const auth = createAuth()
