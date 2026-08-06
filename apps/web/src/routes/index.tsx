import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { OnsideLanding } from '@/components/landing/onside-landing'
import '@/components/landing/onside.css'
import { analytics } from '@/lib/analytics'
import { OG_IMAGE_URL, SITE_URL } from '@/lib/site'

const HOMEPAGE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Onside',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  description:
    'A Onside vai reunir bares que confirmaram a transmissão do seu jogo. Compare o ambiente e cadastre sua cidade para ajudar a definir o primeiro lançamento.',
  url: SITE_URL,
  inLanguage: 'pt-BR',
  audience: {
    '@type': 'Audience',
    audienceType: 'Torcedores e bares esportivos no Brasil'
  }
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        title: 'Onside — Saiba onde assistir ao seu jogo'
      },
      {
        name: 'description',
        content:
          'A Onside vai reunir bares que confirmaram a transmissão do seu jogo. Compare o ambiente e cadastre sua cidade para ajudar a definir o primeiro lançamento.'
      },
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
          'Compare bares por jogo, distância, lotação, som, telões e torcida. Cadastre sua cidade para ajudar a Onside a chegar até você.'
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
          'Compare bares por jogo, distância, lotação, som, telões e torcida. Cadastre sua cidade para ajudar a Onside a chegar até você.'
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

function Landing() {
  useEffect(() => {
    analytics.landingViewed()
  }, [])

  return (
    <>
      <StructuredData schema={HOMEPAGE_SCHEMA} />
      <OnsideLanding />
    </>
  )
}
