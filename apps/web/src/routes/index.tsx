import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { OnsideLanding } from '@/components/landing/onside-landing'
import '@/components/landing/onside.css'
import { useSmoothScroll } from '@/hooks/use-smooth-scroll'
import { analytics } from '@/lib/analytics'

const HOMEPAGE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Onside',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  description:
    'Onside mostra quais bares estão transmitindo a sua partida, com lotação, som, telões e torcida.',
  url: 'https://findsports.com.br',
  inLanguage: 'pt-BR',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'BRL'
  },
  audience: {
    '@type': 'Audience',
    audienceType: 'Torcedores e bares esportivos no Brasil'
  }
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Onside — O jogo é aqui' },
      {
        name: 'description',
        content:
          'Descubra qual bar está passando a sua partida agora — com lotação, som, telões e torcida. Entre na lista de espera do Onside.'
      },
      { name: 'theme-color', content: '#F1EEE6' },
      { name: 'robots', content: 'index, follow' },
      {
        property: 'og:title',
        content: 'Onside — O jogo é aqui'
      },
      {
        property: 'og:description',
        content:
          'Escolha a mesa, não o sofá. Encontre transmissões confirmadas, lotação e o clima de cada bar.'
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://findsports.com.br/' },
      {
        property: 'og:image',
        content: 'https://findsports.com.br/og-image.png?v=2'
      },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:site_name', content: 'Onside' },
      { property: 'og:locale', content: 'pt_BR' },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'twitter:title',
        content: 'Onside — O jogo é aqui'
      },
      {
        name: 'twitter:description',
        content:
          'Encontre transmissões confirmadas, lotação e o clima de cada bar. Lista de espera aberta.'
      },
      {
        name: 'twitter:image',
        content: 'https://findsports.com.br/og-image.png?v=2'
      }
    ],
    links: [
      { rel: 'canonical', href: 'https://findsports.com.br/' },
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
  useSmoothScroll()

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
