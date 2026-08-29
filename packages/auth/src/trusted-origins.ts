type TrustedOriginOptions = {
  baseUrl: string
  nodeEnv: 'development' | 'production' | 'test'
  developmentOrigin?: string
}

export function buildTrustedOrigins({
  baseUrl,
  nodeEnv,
  developmentOrigin
}: TrustedOriginOptions): string[] {
  const canonical = new URL(baseUrl).origin
  if (nodeEnv !== 'development' || !developmentOrigin) return [canonical]

  const development = new URL(developmentOrigin)
  if (development.protocol !== 'https:' || developmentOrigin.includes('*')) {
    throw new Error('AUTH_DEV_TRUSTED_ORIGIN deve ser uma origem HTTPS exata.')
  }

  return development.origin === canonical
    ? [canonical]
    : [canonical, development.origin]
}
