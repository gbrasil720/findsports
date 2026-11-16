import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware
} from 'better-auth/api'
import { generateRandomString } from 'better-auth/crypto'
import { z } from 'zod'

/*
 * A confirmação de e-mail volta ao app por `onside://verified` (ou `exp://`
 * em dev). O plugin `expo()` põe a sessão inteira na URL (`?cookie=`), e
 * qualquer app pode registrar o esquema e recebê-la. Aqui, logo depois dele, o
 * cookie sai da URL e no lugar vai um código de uso único, curto, preso ao
 * `?c=` que o app mandou no `callbackURL`: o SHA-256 (hex) de um verificador
 * que só o app tem (como no PKCE). O app troca código + verificador pela sessão
 * em `POST /app-session/redeem`. Sem `?c=` (app antigo), a URL sai sem sessão
 * e a pessoa entra com a senha.
 */

export const APP_SESSION_CODE_TTL_MS = 60 * 1000
const PREFIX = 'app-session:'
const CHALLENGE = /^[0-9a-f]{64}$/

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * As rotas em que o `expo()` põe o cookie na URL de volta ao app (o mesmo
 * `matcher` dele, `@better-auth/expo`). Todas passam por aqui, mesmo as que
 * ainda não usamos (login social, "Entrar com a Apple", magic link): o cookie
 * sai de todas, e o código só nasce onde o app mandou `?c=`.
 */
export const carriesAppCookie = (path: string | undefined) =>
  !!(
    path?.startsWith('/callback') ||
    path?.startsWith('/oauth2/callback') ||
    path?.startsWith('/magic-link/verify') ||
    path?.startsWith('/verify-email')
  )

/** Igualdade sem atalho no primeiro caractere diferente (tempo constante). */
export function sameString(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** O endereço de volta é do app (não http/https)? */
function appLocation(location: string | null | undefined) {
  if (!location) return null
  try {
    const url = new URL(location)
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : url
  } catch {
    return null
  }
}

export const appSessionHandoff = () =>
  ({
    id: 'app-session-handoff',
    hooks: {
      after: [
        {
          matcher: (ctx) => carriesAppCookie(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.context.responseHeaders
            const url = appLocation(headers?.get('location'))
            if (!url) return
            const cookie = url.searchParams.get('cookie')
            if (!cookie) return
            url.searchParams.delete('cookie')
            const challenge = url.searchParams.get('c')
            if (challenge && CHALLENGE.test(challenge)) {
              const code = generateRandomString(32)
              await ctx.context.internalAdapter.createVerificationValue({
                identifier: `${PREFIX}${code}`,
                value: JSON.stringify({ challenge, cookie }),
                expiresAt: new Date(Date.now() + APP_SESSION_CODE_TTL_MS)
              })
              url.searchParams.set('code', code)
            }
            ctx.setHeader('location', url.toString())
          })
        }
      ]
    },
    endpoints: {
      redeemAppSession: createAuthEndpoint(
        '/app-session/redeem',
        {
          method: 'POST',
          body: z.object({
            code: z.string().min(1).max(64),
            verifier: z.string().min(32).max(128)
          })
        },
        async (ctx) => {
          // Uso único: o código sai do banco na primeira tentativa, certa ou
          // não, então errar o verificador também o gasta.
          const row =
            await ctx.context.internalAdapter.consumeVerificationValue(
              `${PREFIX}${ctx.body.code}`
            )
          const stored = row ? safeParse(row.value) : null
          if (
            !row ||
            !stored ||
            row.expiresAt < new Date() ||
            !sameString(await sha256Hex(ctx.body.verifier), stored.challenge)
          ) {
            throw new APIError('BAD_REQUEST', {
              message: 'Este link já foi usado ou venceu.',
              code: 'INVALID_APP_SESSION_CODE'
            })
          }
          return ctx.json({ cookie: stored.cookie })
        }
      )
    }
  }) satisfies BetterAuthPlugin

function safeParse(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      challenge?: unknown
      cookie?: unknown
    }
    return typeof parsed.challenge === 'string' &&
      typeof parsed.cookie === 'string'
      ? { challenge: parsed.challenge, cookie: parsed.cookie }
      : null
  } catch {
    return null
  }
}
