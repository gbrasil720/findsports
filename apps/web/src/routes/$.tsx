import { createFileRoute, notFound } from '@tanstack/react-router'
import { NOT_FOUND_META } from '@/components/not-found/not-found-head'
import { NotFoundPage } from '@/components/not-found/not-found-page'

export const Route = createFileRoute('/$')({
  beforeLoad: () => {
    throw notFound()
  },
  head: () => ({
    meta: [...NOT_FOUND_META, { name: 'theme-color', content: '#F1EEE6' }],
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
        href: '/onside-icone-preto-broken.webp',
        as: 'image',
        type: 'image/webp'
      }
    ]
  }),
  notFoundComponent: NotFoundPage,
  component: NotFoundPage
})
