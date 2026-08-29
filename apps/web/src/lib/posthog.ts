import { env } from './env'

type PosthogClient = typeof import('posthog-js').default

let instance: PosthogClient | null = null
let loadPromise: Promise<PosthogClient | null> | null = null

export function getPosthog(): PosthogClient | null {
  return instance
}

/**
 * Carrega o SDK só no cliente, e só quando analytics/flags pedem.
 * O import dinâmico tira o PostHog do chunk principal.
 */
export function loadPosthog(): Promise<PosthogClient | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  loadPromise ??= import('posthog-js')
    .then((mod) => {
      instance = mod.default
      return instance
    })
    .catch(() => null)
  return loadPromise
}

export async function initPostHog(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  const projectKey = env.VITE_POSTHOG_KEY
  if (!projectKey) return false

  const posthog = await loadPosthog()
  if (!posthog) return false
  if (posthog.__loaded) return true

  posthog.init(projectKey, {
    api_host: env.VITE_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie'
  })
  return true
}

export async function withPosthog(
  fn: (posthog: PosthogClient) => void
): Promise<void> {
  const ok = await initPostHog()
  if (!ok) return
  const posthog = getPosthog()
  if (posthog) fn(posthog)
}
