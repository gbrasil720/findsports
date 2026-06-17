/** biome-ignore-all lint/style/noHeadElement: <> */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <explanation> */
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Toaster } from '@findsports_oficial/ui/components/sonner'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { Analytics } from '@vercel/analytics/react'
import posthog from 'posthog-js'
import { useEffect, useRef } from 'react'
import { ImpersonationBanner } from '../components/impersonation-banner'
import appCss from '../index.css?url'
import { authMiddleware } from '../middleware/auth'
import { type AuthSession, applyAuthGuards } from '../utils/auth-guards'

export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>
  queryClient: QueryClient
}

const getSession = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => {
    return context.session
  })

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    applyAuthGuards(session as AuthSession, location.pathname)
    return { session }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'FindSports — Ache o bar que está passando seu jogo' },
      {
        name: 'description',
        content:
          'FindSports conecta torcedores brasileiros aos bares e pubs que estão transmitindo o jogo que você quer assistir. Encontre o lugar certo para torcer.'
      },
      { name: 'author', content: 'FindSports' },
      { name: 'theme-color', content: '#FF5A1F' },
      { property: 'og:site_name', content: 'FindSports' },
      { property: 'og:type', content: 'website' },
      {
        property: 'og:title',
        content: 'FindSports — Ache o bar que está passando seu jogo'
      },
      {
        property: 'og:description',
        content:
          'Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.'
      },
      {
        property: 'og:image',
        content: 'https://findsports.com.br/og-image.png'
      },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:url', content: 'https://findsports.com.br/' },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'twitter:title',
        content: 'FindSports — Ache o bar que está passando seu jogo'
      },
      {
        name: 'twitter:description',
        content:
          'Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.'
      },
      {
        name: 'twitter:image',
        content: 'https://findsports.com.br/og-image.png'
      }
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap'
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootDocument
})

function PostHogProvider() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const initialized = useRef(false)

  // Init — roda uma vez no cliente
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie'
    })

    // expõe globalmente para debug
    ;(window as any).ph = posthog
  }, [])

  // Identify — roda quando sessão muda
  useEffect(() => {
    if (!initialized.current) return

    if (session?.user) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        role: session.user.role
      })
    } else {
      posthog.reset()
    }
  }, [session?.user?.id])

  // Pageview — roda quando rota muda
  useEffect(() => {
    if (!initialized.current) return
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname])

  return null
}

function RootDocument() {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="grid min-h-svh grid-rows-[auto_1fr]">
          <PostHogProvider />
          <Outlet />
        </div>
        <Toaster richColors />
        <ImpersonationBanner />
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Analytics />
        <Scripts />
      </body>
    </html>
  )
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
