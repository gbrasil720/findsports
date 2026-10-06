import { analyticsConfigured, readAnalyticsConsent } from './analytics-consent'
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

/**
 * Todo evento passa por aqui (`withPosthog`), então é aqui que o
 * consentimento vale: sem aceite gravado o SDK nem é baixado — nenhum cookie,
 * nenhuma requisição ao PostHog (WEB-243).
 */
export async function initPostHog(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!analyticsConfigured()) return false
  if (readAnalyticsConsent() !== 'granted') return false
  const projectKey = env.VITE_POSTHOG_KEY
  if (!projectKey) return false

  const posthog = await loadPosthog()
  if (!posthog) return false
  // A escolha pode ter mudado enquanto o SDK baixava.
  if (readAnalyticsConsent() !== 'granted') return false
  if (posthog.__loaded) {
    // Recusou e voltou a aceitar na mesma visita. Sem evento de opt-in: a
    // troca de escolha não é dado de produto.
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing({ captureEventName: false })
    }
    return true
  }

  posthog.init(projectKey, {
    api_host: env.VITE_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie',
    // Com isto, `opt_out_capturing` também desliga e apaga a persistência.
    opt_out_persistence_by_default: true
  })
  return true
}

/** Apaga o que o SDK guardou no navegador, em qualquer domínio que ele use. */
export function clearPosthogStorage() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('ph_')) window.localStorage.removeItem(key)
    }
  } catch {
    // Armazenamento bloqueado: não há o que apagar.
  }
  const labels = window.location.hostname.split('.')
  const domains = ['']
  for (let i = 0; i < labels.length - 1; i++) {
    domains.push(`; domain=.${labels.slice(i).join('.')}`)
  }
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (!name?.startsWith('ph_')) continue
    for (const domain of domains) {
      // biome-ignore lint/suspicious/noDocumentCookie: apagar cookie de terceiro por nome não tem API melhor com suporte amplo
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`
    }
  }
}

/**
 * A pessoa recusou depois de ter aceitado: para de capturar agora e apaga o
 * identificador que o SDK tinha gravado. Sem SDK carregado não há o que fazer.
 */
export function stopPostHog(): void {
  if (typeof window === 'undefined') return
  if (instance?.__loaded && !instance.has_opted_out_capturing()) {
    instance.opt_out_capturing()
  }
  clearPosthogStorage()
}

export async function withPosthog(
  fn: (posthog: PosthogClient) => void
): Promise<void> {
  const ok = await initPostHog()
  if (!ok) return
  const posthog = getPosthog()
  if (posthog) fn(posthog)
}
