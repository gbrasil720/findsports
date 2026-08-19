import posthog from 'posthog-js'

import { env } from './env'

export function initPostHog(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  if (posthog.__loaded) return true
  const projectKey = env.VITE_POSTHOG_KEY
  if (!projectKey) return false

  posthog.init(projectKey, {
    api_host: env.VITE_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie'
  })
  return true
}
