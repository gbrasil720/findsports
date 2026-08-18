import posthog from 'posthog-js'

export function initPostHog(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  if (posthog.__loaded) return true
  const projectKey = import.meta.env.VITE_POSTHOG_KEY
  if (!projectKey) return false

  posthog.init(projectKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie'
  })
  return true
}
