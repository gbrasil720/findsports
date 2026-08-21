import {
  checkout,
  dodopayments,
  portal,
  webhooks
} from '@dodopayments/better-auth'
import { createHttpDb, db, eq } from '@findsports_oficial/db'
import * as schema from '@findsports_oficial/db/schema/auth'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import DodoPayments from 'dodopayments'
import { z } from 'zod'
import { getBarAccountDeletionBlock } from './account-deletion-policy'

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
async function getBarByCustomerEmail(email: string) {
  const foundUser = await db.query.user.findFirst({
    where: eq(user.email, email)
  })
  if (!foundUser) return null

  return db.query.bar.findFirst({
    where: eq(bar.userId, foundUser.id)
  })
}

async function handleSubscriptionActivated(payload: any) {
  const data = payload.data ?? payload
  const email = data?.customer?.email
  const dodoSubId = data?.subscription_id
  const productId = data?.product_id
  const plan = productId ? PLAN_BY_PRODUCT[productId] : 'starter'

  if (!email || !dodoSubId) return

  const foundBar = await getBarByCustomerEmail(email)
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

  return betterAuth({
    appName: 'Onside',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: schema
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      'https://nintendo-hyperlink-undamaged.ngrok-free.dev'
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false
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
        maxAge: 60
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
