import { stripe } from '@better-auth/stripe'
import { emailAssetUrls } from '@findsports_oficial/config/site'
import { db, eq } from '@findsports_oficial/db'
import * as schema from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { env, getPublicAppUrl } from '@findsports_oficial/env/server'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx
} from 'better-auth/api'
import { admin, captcha } from 'better-auth/plugins'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { z } from 'zod'
import { getBarAccountDeletionBlock } from './account-deletion-policy'
import { runInBackground } from './background'
import {
  blocksNewCheckout,
  canAccessPubBilling,
  requiresPubBillingAccess
} from './billing-access'
import { sendResetPasswordEmailWithResend } from './reset-password-email'
import { isCloudflareWorkers } from './runtime'
import { assertNoSelfRoleChange } from './self-role-change'
import { isSafeUserImage } from './session-image'
import { sessionTokenGuard } from './session-token'
import { startCookies } from './start-cookies'
import { checkoutParamsFor } from './stripe-checkout'
import { stripeClient } from './stripe-client'
import { STRIPE_PLANS } from './stripe-plan'
import { syncStripeEvent } from './stripe-sync'
import { buildTrustedOrigins } from './trusted-origins'
import {
  publicEmailUrl,
  sendVerificationEmailWithResend
} from './verification-email'

function cookieDomainFor(baseUrl: string): string | undefined {
  const host = new URL(baseUrl).hostname.replace(/^www\./, '')
  if (host === 'onside.sh') return host
  return undefined
}

/**
 * Turnstile nas rotas públicas que criam conta, disparam e-mail para um
 * endereço qualquer ou testam senha (login). O plugin lê o token do header
 * `x-captcha-response` e manda o IP de `advanced.ipAddress` (o
 * `cf-connecting-ip` no Worker). Só vale para requisição HTTP: chamada por
 * `auth.api` não passa por ele (`captcha-scope.test.ts`).
 *
 * Sem `TURNSTILE_SECRET_KEY` o plugin nem entra — o deploy pode chegar antes
 * do segredo. A rota tRPC da waitlist segue a mesma regra
 * (`packages/api/src/lib/turnstile.ts`), então o aviso daqui vale pelas duas.
 */
function turnstilePlugin() {
  if (env.TURNSTILE_SECRET_KEY) {
    return captcha({
      provider: 'cloudflare-turnstile',
      secretKey: env.TURNSTILE_SECRET_KEY,
      endpoints: [
        '/sign-up/email',
        '/sign-in/email',
        '/request-password-reset',
        '/send-verification-email'
      ]
    })
  }
  if (env.NODE_ENV === 'production') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'turnstile_disabled',
        reason: 'TURNSTILE_SECRET_KEY ausente'
      })
    )
  }
  // Plugin vazio, e não array condicional: espalhar `[]` na lista de plugins
  // tira dela o tipo de tupla, e a inferência dos campos do admin se perde.
  return { id: 'captcha-disabled' }
}

export function createAuth() {
  const cookieDomain = cookieDomainFor(env.BETTER_AUTH_URL)

  return betterAuth({
    appName: 'Onside',
    advanced: {
      backgroundTasks: { handler: runInBackground },
      // WEB-199: no Workers o `x-forwarded-for` traz o que o cliente mandou;
      // fora dele (dev, testes) fica o padrão, ver `runtime.ts`.
      ...(isCloudflareWorkers
        ? { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } }
        : {}),
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
        // `image` só entra pelo avatar enviado ao nosso store: um host
        // qualquer veria IP e horário de quem vê a foto. No cadastro ainda
        // não há usuário, então ali só cabe vazio.
        if (ctx.path === '/update-user' || ctx.path === '/sign-up/email') {
          const image = (ctx.body as { image?: unknown } | undefined)?.image
          if (image !== undefined && image !== null && image !== '') {
            const userId =
              ctx.path === '/update-user'
                ? (await getSessionFromCtx(ctx))?.user.id
                : undefined
            if (!isSafeUserImage(image, userId, env)) {
              throw new APIError('BAD_REQUEST', {
                message: 'A foto precisa ser enviada pelo upload do perfil.'
              })
            }
          }
          if (ctx.path === '/update-user') assertNoSelfRoleChange(ctx.body)
        }
        if (!requiresPubBillingAccess(ctx.path)) return
        const session = await getSessionFromCtx(ctx)
        if (!canAccessPubBilling(session?.user ?? null)) {
          throw new APIError('FORBIDDEN', {
            message:
              'Apenas bares com e-mail verificado podem acessar cobrança.'
          })
        }
        // WEB-172: plano parado regulariza a assinatura que existe; a tela já
        // não oferece checkout, isto cobre a rota chamada direto.
        if (ctx.path === '/subscription/upgrade' && session) {
          const ownerBar = await db.query.bar.findFirst({
            where: eq(bar.userId, session.user.id),
            with: { subscription: true }
          })
          if (blocksNewCheckout(ownerBar?.subscription ?? null)) {
            throw new APIError('CONFLICT', {
              message:
                'Seu plano está com pagamento pendente. Regularize a assinatura em “Assinatura e pagamentos” antes de contratar de novo.',
              code: 'SUBSCRIPTION_PAST_DUE'
            })
          }
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
      // WEB-53: recuperação self-service pelo fluxo nativo do better-auth.
      //
      // O endpoint `/request-password-reset` já responde a mesma mensagem
      // para e-mail existente e inexistente (e ainda simula a geração do
      // token para nivelar o tempo de resposta), então não há enumeração de
      // contas a proteger aqui — a UI só não pode acrescentar o que o
      // servidor calou.
      resetPasswordTokenExpiresIn: 60 * 60,
      // Quem redefine a senha normalmente é quem perdeu o acesso; se a conta
      // estava comprometida, as sessões do invasor precisam cair junto.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const publicAppUrl = getPublicAppUrl()
        await sendResetPasswordEmailWithResend({
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.RESEND_FROM_EMAIL,
          to: user.email,
          name: user.name,
          // `url` sai com o host de `BETTER_AUTH_URL`, que localmente é
          // localhost e não abre na caixa de entrada de ninguém.
          resetUrl: publicEmailUrl(url, publicAppUrl, env.BETTER_AUTH_URL),
          ...emailAssetUrls(publicAppUrl)
        })
      },
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: 'fan',
        banned: false,
        banReason: null,
        banExpires: null,
        twoFactorEnabled: false,
        stripeCustomerId: null,
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
        const publicAppUrl = getPublicAppUrl()
        await sendVerificationEmailWithResend({
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.RESEND_FROM_EMAIL,
          to: user.email,
          name: user.name,
          verificationUrl: publicEmailUrl(
            url,
            publicAppUrl,
            env.BETTER_AUTH_URL
          ),
          ...emailAssetUrls(publicAppUrl)
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
        // E2E (WEB-174): sem cache, papel e ban gravados direto no banco
        // valem na requisição seguinte, e não 60s depois.
        enabled: !env.E2E_DISABLE_CACHES,
        maxAge: 60,
        // v2: fotos deixam de ir no cookie (eram data URL de ~25 KB e
        // estouravam o limite de header — 494 REQUEST_HEADER_TOO_LARGE).
        version: '2'
      }
    },
    plugins: [
      turnstilePlugin(),
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
      // Cobrança pelo Stripe (WEB-31). O plugin cuida de checkout, portal e
      // da verificação da assinatura do webhook (`/stripe/webhook`); o estado
      // dele fica em `stripe_subscription`. O que o app lê — plano, situação e
      // fim do período em `subscription` — quem grava é o `onEvent`.
      stripe({
        stripeClient,
        // Sem o segredo o webhook responde 500 em vez de aceitar sem conferir.
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
        // O cliente no Stripe nasce no primeiro checkout, com o e-mail do
        // dono do bar: é para lá que o Stripe manda recibo e aviso (PRO-5).
        createCustomerOnSignUp: false,
        // `subscription` já é a nossa tabela, em `platform.ts`.
        schema: { subscription: { modelName: 'stripeSubscription' } },
        // Aqui, e não nos `onSubscription*`: o plugin engole o erro desses e
        // responde 200, e o Stripe não reenviaria. Erro no `onEvent` vira 400.
        onEvent: (event) => syncStripeEvent(event, stripeClient),
        subscription: {
          enabled: true,
          plans: STRIPE_PLANS,
          requireEmailVerification: true,
          getCheckoutSessionParams: async ({ user, subscription }) => ({
            params: await checkoutParamsFor(
              user,
              subscription.stripeCustomerId,
              stripeClient
            )
          })
        }
      }),
      sessionTokenGuard(),
      // Por último: o plugin repassa ao TanStack Start os cookies que os
      // `hooks.after` anteriores gravaram. Plugin depois dele que grave cookie
      // (twoFactor, admin) teria o `Set-Cookie` perdido. É o nosso, e não o
      // `tanstackStartCookies` do better-auth: ver `start-cookies.ts`.
      startCookies()
    ]
  })
}

export const auth = createAuth()
