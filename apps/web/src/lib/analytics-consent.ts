import { useSyncExternalStore } from 'react'
import { env } from './env'

/**
 * Consentimento para os cookies de análise (WEB-243).
 *
 * A política de privacidade promete que a análise depende de aceite e pode
 * ser recusada. Este módulo é onde a escolha mora; quem a faz valer é
 * `initPostHog`, que não baixa o SDK sem `granted` gravado aqui.
 */
export type AnalyticsConsent = 'granted' | 'denied'

/** `ssr`: no servidor não há navegador para perguntar. `unset`: ainda não escolheu. */
export type AnalyticsConsentState = AnalyticsConsent | 'unset' | 'ssr'

export const ANALYTICS_CONSENT_KEY = 'onside:analytics-consent'

const listeners = new Set<() => void>()
// Navegador com armazenamento bloqueado: a escolha vale até a aba fechar.
let memory: AnalyticsConsent | null = null
let reviewing = false

function notify() {
  for (const listener of listeners) listener()
}

/** Só há o que consentir onde a análise roda: fora do dev e com chave. */
export function analyticsConfigured(): boolean {
  return !import.meta.env.DEV && Boolean(env.VITE_POSTHOG_KEY)
}

/**
 * O aviso aparece onde a análise roda. A suíte E2E roda em `vite dev`, sem
 * análise, e liga só o aviso por `VITE_E2E_CONSENT_BANNER`; lá o PostHog
 * continua desligado, porque `initPostHog` pergunta por `analyticsConfigured`.
 */
export function consentBannerEnabled(): boolean {
  return analyticsConfigured() || env.VITE_E2E_CONSENT_BANNER === '1'
}

/**
 * Vai inline no `<head>` e roda antes do primeiro paint: se ainda não há
 * escolha gravada, marca `<html data-consent="pending">`. O aviso já vem no
 * HTML do servidor, e é esse atributo que o mostra (`cookie-consent.css`) e
 * que faz o hero da landing ceder espaço. Sem isto a decisão só existia
 * depois da hidratação, e o aviso surgia com a página já na tela.
 *
 * Tem de concordar com `readAnalyticsConsent`: armazenamento bloqueado conta
 * como sem escolha.
 */
export const CONSENT_HEAD_SCRIPT = `(function(){var c=null;try{c=localStorage.getItem(${JSON.stringify(ANALYTICS_CONSENT_KEY)})}catch(e){}if(c!=='granted'&&c!=='denied')document.documentElement.setAttribute('data-consent','pending')})()`

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    if (stored === 'granted' || stored === 'denied') return stored
  } catch {
    // Cai na memória.
  }
  return memory
}

export function setAnalyticsConsent(value: AnalyticsConsent) {
  memory = value
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value)
  } catch {
    // Sem armazenamento a escolha fica só na memória desta aba.
  }
  reviewing = false
  notify()
}

/** Reabre o aviso para quem já escolheu e quer trocar. */
export function reviewAnalyticsConsent() {
  reviewing = true
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Outra aba mudou a escolha.
  const onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useAnalyticsConsent(): AnalyticsConsentState {
  return useSyncExternalStore<AnalyticsConsentState>(
    subscribe,
    () => readAnalyticsConsent() ?? 'unset',
    () => 'ssr'
  )
}

export function useAnalyticsConsentReview(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reviewing,
    () => false
  )
}
