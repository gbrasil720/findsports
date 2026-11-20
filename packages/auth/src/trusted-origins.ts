type TrustedOriginOptions = {
  baseUrl: string
  nodeEnv: 'development' | 'production' | 'test'
  developmentOrigin?: string
  /** Esquema do deep link do app nativo, sem `://`. */
  appScheme?: string
}

/**
 * Esquema do app nativo (`apps/mobile/app.json`, campo `scheme`). O app não tem
 * origem HTTP: o plugin `expo()` do better-auth o identifica por `onside://`.
 */
export const APP_SCHEME = 'onside'

/**
 * Origens do Expo em desenvolvimento: o Expo Go se apresenta por `exp://` e o
 * Metro serve em `localhost:8081`. Qualquer app em Expo Go usa `exp://`, por
 * isso nunca valem fora de `development`.
 */
const EXPO_DEVELOPMENT_ORIGINS = ['exp://', 'http://localhost:8081']

function wwwSiblingOrigin(origin: string): string | null {
  const url = new URL(origin)
  const host = url.hostname
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1'
  ) {
    return null
  }
  url.hostname = host.startsWith('www.') ? host.slice(4) : `www.${host}`
  const sibling = url.origin
  return sibling === origin ? null : sibling
}

/**
 * WEB-383: o Houdini (`houdini.onside.sh`) chama o auth do próprio host
 * (impersonar, banir, 2FA), com o cookie que já vale em `onside.sh`. Em
 * desenvolvimento, `houdini.localhost` testa o modo host.
 */
function houdiniOrigin(
  origin: string,
  nodeEnv: TrustedOriginOptions['nodeEnv']
): string | null {
  const url = new URL(origin)
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'onside.sh') {
    url.hostname = 'houdini.onside.sh'
    return url.origin
  }
  if (nodeEnv === 'development' && host === 'localhost') {
    url.hostname = 'houdini.localhost'
    return url.origin
  }
  return null
}

export function buildTrustedOrigins({
  baseUrl,
  nodeEnv,
  developmentOrigin,
  appScheme
}: TrustedOriginOptions): string[] {
  const canonical = new URL(baseUrl).origin
  const origins = [canonical]
  const wwwSibling = wwwSiblingOrigin(canonical)
  if (wwwSibling) origins.push(wwwSibling)
  const houdini = houdiniOrigin(canonical, nodeEnv)
  if (houdini) origins.push(houdini)
  if (appScheme) origins.push(`${appScheme}://`)

  if (nodeEnv !== 'development') return origins
  if (appScheme) origins.push(...EXPO_DEVELOPMENT_ORIGINS)
  if (!developmentOrigin) return origins

  const development = new URL(developmentOrigin)
  if (development.protocol !== 'https:' || developmentOrigin.includes('*')) {
    throw new Error('AUTH_DEV_TRUSTED_ORIGIN deve ser uma origem HTTPS exata.')
  }

  if (!origins.includes(development.origin)) origins.push(development.origin)
  return origins
}

/**
 * Para onde o link de redefinição de senha leva o token: só um caminho do
 * próprio site ou uma origem http(s) confiável. Nunca o esquema do app
 * (`onside://`), que outro app instalado pode registrar e receber o token; o
 * app manda `/reset-password` e a senha nova é escolhida no site. Vazio é o
 * padrão do better-auth (a página de erro dele).
 */
export function isSafeResetRedirect(
  target: unknown,
  trustedOrigins: string[]
): boolean {
  if (target === undefined || target === null || target === '') return true
  if (typeof target !== 'string') return false
  if (target.startsWith('/'))
    return !target.startsWith('//') && !target.includes('\\')
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return trustedOrigins.includes(url.origin)
}

/** A página do site onde a senha nova é escolhida. */
export const RESET_PASSWORD_PATH = '/reset-password'

/**
 * O destino do reset que vale de fato: o pedido, se é seguro; a página do
 * site, se era o esquema do app (build antigo do app e e-mails mandados antes
 * desta regra, que assim abrem no site em vez de falhar); `null`, recusa.
 */
export function resetRedirectTarget(
  target: unknown,
  trustedOrigins: string[]
): { keep: true } | { replace: string } | null {
  if (isSafeResetRedirect(target, trustedOrigins)) return { keep: true }
  if (typeof target !== 'string') return null
  try {
    const { protocol } = new URL(target)
    if (protocol !== 'http:' && protocol !== 'https:')
      return { replace: RESET_PASSWORD_PATH }
  } catch {}
  return null
}

/**
 * CSRF do tRPC: POST com `Origin` de fora das origens confiáveis é recusado.
 * Sem `Origin` passa: o app nativo (cookie no header) e chamada de servidor
 * não mandam, e navegador sempre manda em POST de outro site. `null`
 * (iframe com sandbox, redirect entre origens) conta como de fora.
 */
export function isForeignPost(
  method: string,
  origin: string | null,
  trustedOrigins: readonly string[]
): boolean {
  if (method.toUpperCase() !== 'POST' || origin === null) return false
  return !trustedOrigins.includes(origin)
}
