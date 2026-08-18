import { createFileRoute, notFound } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/not-found/not-found-page'

const NOT_FOUND_DESCRIPTION =
  'Essa página saiu de campo. O link pode estar quebrado ou a página não existe mais.'

export const Route = createFileRoute('/$')({
  beforeLoad: () => {
    throw notFound()
  },
  head: () => ({
    meta: [
      { title: 'Página não encontrada — Onside' },
      { name: 'description', content: NOT_FOUND_DESCRIPTION },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'theme-color', content: '#F1EEE6' }
    ],
    links: [
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
        href: '/onside-icone-preto-broken.png',
        as: 'image'
      }
    ]
  }),
  notFoundComponent: NotFoundPage,
  component: NotFoundPage
})
