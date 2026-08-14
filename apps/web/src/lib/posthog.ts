import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window === 'undefined') return
  if (posthog.__loaded) return
  const projectKey = import.meta.env.VITE_POSTHOG_KEY
  if (!projectKey) return

  posthog.init(projectKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    capture_pageview: false, // vamos controlar manualmente
    capture_pageleave: true,
    persistence: 'localStorage+cookie'
  })
}
