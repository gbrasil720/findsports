import { createFileRoute } from '@tanstack/react-router'
import { OnsideLanding } from '@/components/landing/onside-landing'
import { OG_IMAGE_URL, SITE_URL } from '@/lib/site'
import { HOME_STRUCTURED_DATA, jsonLd } from '@/lib/structured-data'

// Marca primeiro e a busca que a home responde: "onde assistir ao jogo".
const TITLE = 'Onside — Onde assistir ao jogo no bar perto de você'
const DESCRIPTION =
  'Onde assistir ao jogo? A Onside mostra os bares perto de você que vão passar a partida, com ambiente, telão, preço médio e distância. Grátis para torcedores.'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      {
        name: 'theme-color',
        content: '#C9F135'
      },
      {
        name: 'robots',
        content: 'index, follow'
      },

      {
        property: 'og:title',
        content: 'Onde seu jogo vai passar? A Onside vai mostrar.'
      },
      {
        property: 'og:description',
        content:
          'Compare bares por jogo, infraestrutura, preço médio e distância. Crie sua conta, de torcedor ou de bar.'
      },
      {
        property: 'og:type',
        content: 'website'
      },
      {
        property: 'og:url',
        content: `${SITE_URL}/`
      },
      {
        property: 'og:image',
        content: OG_IMAGE_URL
      },
      {
        property: 'og:image:width',
        content: '1200'
      },
      {
        property: 'og:image:height',
        content: '630'
      },
      {
        property: 'og:site_name',
        content: 'Onside'
      },
      {
        property: 'og:locale',
        content: 'pt_BR'
      },

      {
        name: 'twitter:card',
        content: 'summary_large_image'
      },
      {
        name: 'twitter:title',
        content: 'Onde seu jogo vai passar? A Onside vai mostrar.'
      },
      {
        name: 'twitter:description',
        content:
          'Compare bares por jogo, infraestrutura, preço médio e distância. Crie sua conta, de torcedor ou de bar.'
      },
      {
        name: 'twitter:image',
        content: OG_IMAGE_URL
      }
    ],

    links: [
      {
        rel: 'canonical',
        href: `${SITE_URL}/`
      },
      {
        rel: 'preload',
        href: '/fonts/onside/anton-latin-400.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'preload',
        href: '/fonts/onside/archivo-latin-wght.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'preload',
        href: '/fonts/onside/geist-mono-latin-wght.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous'
      }
    ]
  }),
  component: Landing
})

function StructuredData({ schema }: { schema: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data is static and safe
      dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
    />
  )
}

function Landing() {
  return (
    <>
      <StructuredData schema={HOME_STRUCTURED_DATA} />
      <OnsideLanding />
    </>
  )
}
