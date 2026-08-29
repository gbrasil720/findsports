type TrustedOriginOptions = {
  baseUrl: string
  nodeEnv: 'development' | 'production' | 'test'
  developmentOrigin?: string
}

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

export function buildTrustedOrigins({
  baseUrl,
  nodeEnv,
  developmentOrigin
}: TrustedOriginOptions): string[] {
  const canonical = new URL(baseUrl).origin
  const origins = [canonical]
  const wwwSibling = wwwSiblingOrigin(canonical)
  if (wwwSibling) origins.push(wwwSibling)

  if (nodeEnv !== 'development' || !developmentOrigin) return origins

  const development = new URL(developmentOrigin)
  if (development.protocol !== 'https:' || developmentOrigin.includes('*')) {
    throw new Error('AUTH_DEV_TRUSTED_ORIGIN deve ser uma origem HTTPS exata.')
  }

  if (!origins.includes(development.origin)) origins.push(development.origin)
  return origins
}
