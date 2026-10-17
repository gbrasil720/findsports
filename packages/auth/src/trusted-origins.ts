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
