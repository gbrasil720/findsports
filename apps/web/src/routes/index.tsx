import { createFileRoute } from '@tanstack/react-router'
import { OnsideLanding } from '@/components/landing/onside-landing'
import { pageHead } from '@/lib/page-head'
import { HOME_STRUCTURED_DATA, jsonLd } from '@/lib/structured-data'

// Marca primeiro e a busca que a home responde: "onde assistir ao jogo".
const TITLE = 'Onside — Onde assistir ao jogo no bar perto de você'
const DESCRIPTION =
  'Onde assistir ao jogo? A Onside mostra os bares perto de você que vão passar a partida, com ambiente, telão, preço médio e distância. Grátis para torcedores.'

const HOME_HEAD = pageHead({
  path: '/',
  title: TITLE,
  description: DESCRIPTION,
  indexable: true,
  social: {
    title: 'Onde seu jogo vai passar? A Onside vai mostrar.',
    description:
      'Compare bares por jogo, infraestrutura, preço médio e distância. Crie sua conta, de torcedor ou de bar.'
  }
})

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...HOME_HEAD.meta,
      {
        name: 'theme-color',
        content: '#C9F135'
      }
    ],

    links: [
      ...HOME_HEAD.links,
      // A Anton é a do título, que disputa o LCP com o pôster: vai na frente.
      // Archivo e Geist Mono continuam pré-carregadas, mas sem tirar banda do
      // pôster e da Anton no celular.
      {
        rel: 'preload',
        href: '/fonts/onside/anton-latin-400.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
        fetchPriority: 'high'
      },
      {
        rel: 'preload',
        href: '/fonts/onside/archivo-latin-wght.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
        fetchPriority: 'low'
      },
      {
        rel: 'preload',
        href: '/fonts/onside/geist-mono-latin-wght.woff2?v=2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
        fetchPriority: 'low'
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
