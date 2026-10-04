import { env } from '@findsports_oficial/env/server'

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verificação do Cloudflare Turnstile para rotas tRPC públicas. As rotas do
 * better-auth usam o plugin `captcha` (packages/auth), que fala com o mesmo
 * endpoint.
 *
 * Sem segredo, deixa passar: o deploy pode chegar antes dele (o aviso sai no
 * boot do auth). Com segredo, token ausente ou recusado é `false`. Falha de
 * rede propaga — melhor um erro de servidor do que aceitar sem verificar.
 */
export async function turnstileAllows(
  token: string | undefined,
  clientIp: string,
  secret = env.TURNSTILE_SECRET_KEY,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!secret) return true
  if (!token) return false

  const response = await fetchImpl(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      // `extrairIp` devolve 'unknown' quando não há IP confiável.
      ...(clientIp !== 'unknown' ? { remoteip: clientIp } : {})
    }),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) {
    throw new Error(`Turnstile siteverify respondeu ${response.status}`)
  }
  const result = (await response.json()) as { success?: unknown }
  return result.success === true
}
