export const SITE_URL = 'https://www.onside.sh'
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg?v=3`

/**
 * Arte dos e-mails: base pública e estável, nunca o host do deploy.
 *
 * E-mail é imutável e vive anos na caixa de entrada (via proxy de cache do
 * Gmail, que indexa pela URL). Por isso a arte não pode sair de
 * `BETTER_AUTH_URL`: em envio local ou de preview ela apontaria para
 * localhost ou para o domínio do deploy, e quebraria depois. A base é o site
 * canônico, e a versão na query string permite invalidar o cache quando o
 * asset mudar.
 */
export const EMAIL_LOGO_URL = `${SITE_URL}/onside-wordmark-paper.png?v=1`
export const EMAIL_HERO_IMAGE_URL = OG_IMAGE_URL
