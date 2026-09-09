export const SITE_URL = 'https://www.onside.sh'
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg?v=3`

/**
 * Arte dos e-mails: caminhos versionados para furar o cache do provedor.
 *
 * O servidor fornece a base pública por `PUBLIC_APP_URL`; os valores abaixo
 * mantêm a versão da URL canônica usada pelo site.
 */
const EMAIL_LOGO_PATH = '/onside-wordmark-paper.png?v=1'
const EMAIL_HERO_IMAGE_PATH = '/og-image.jpg?v=3'

export function emailAssetUrls(baseUrl: string) {
  return {
    logoUrl: new URL(EMAIL_LOGO_PATH, baseUrl).toString(),
    heroImageUrl: new URL(EMAIL_HERO_IMAGE_PATH, baseUrl).toString()
  }
}

const canonicalEmailAssets = emailAssetUrls(SITE_URL)
export const EMAIL_LOGO_URL = canonicalEmailAssets.logoUrl
export const EMAIL_HERO_IMAGE_URL = canonicalEmailAssets.heroImageUrl
