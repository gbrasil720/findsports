import {
  FAQ_ITEMS,
  SOCIAL_LINKS
} from '@/components/landing/onside-landing-content'
import { SITE_URL } from '@/lib/site'

/**
 * JSON-LD da home: `WebSite`, `Organization` e `FAQPage`.
 *
 * É o `WebSite` na home que faz o Google mostrar "Onside" como nome do site no
 * resultado, em vez de "onside.sh" (developers.google.com/search/docs/
 * appearance/site-names). O `url` tem de ser a home canônica, com a barra.
 * O `Organization` dá o logo e liga os perfis das redes à marca. O `FAQPage`
 * sai de `FAQ_ITEMS`, a mesma lista que a seção "Dúvidas" mostra: o Google
 * exige que pergunta e resposta do JSON-LD estejam visíveis na página.
 */
const HOME_URL = `${SITE_URL}/`
const ORGANIZATION_ID = `${HOME_URL}#organization`

const SITE_NAME = 'Onside'

export const HOME_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${HOME_URL}#website`,
      name: SITE_NAME,
      alternateName: ['Onside App', 'onside.sh'],
      url: HOME_URL,
      inLanguage: 'pt-BR',
      publisher: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE_NAME,
      alternateName: 'onside.sh',
      url: HOME_URL,
      // Quadrado, acima dos 112 px que o Google pede para logo.
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icons/icon-512.png`,
        width: 512,
        height: 512
      },
      email: 'contato@onside.sh',
      description:
        'A Onside mostra aos torcedores os bares que vão passar o jogo, com ambiente, preço médio e distância.',
      areaServed: 'BR',
      sameAs: SOCIAL_LINKS.map((rede) => rede.href)
    },
    {
      '@type': 'FAQPage',
      '@id': `${HOME_URL}#duvidas`,
      inLanguage: 'pt-BR',
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer }
      }))
    }
  ]
} as const

/** JSON para dentro de `<script>`: `<` escapado, nada fecha a tag antes da hora. */
export function jsonLd(dados: object): string {
  return JSON.stringify(dados).replaceAll('<', '\\u003c')
}
