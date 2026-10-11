import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

/**
 * O que estes testes travam é o lado seguro do consentimento (WEB-243): sem
 * uma escolha válida gravada não há aceite, e recusar apaga o que a análise
 * deixou no navegador. O fluxo inteiro, com o SDK de verdade, é conferido no
 * preview — em `vite dev` e no E2E o PostHog não inicializa.
 */

let dom: JSDOM

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.onside.test/'
  })
  for (const chave of ['window', 'document'] as const) {
    Object.defineProperty(globalThis, chave, {
      value: dom.window[chave],
      configurable: true
    })
  }
})

afterEach(() => {
  dom.window.close()
})

describe('escolha de cookies de análise', () => {
  test('sem nada gravado não há aceite', async () => {
    const { readAnalyticsConsent } = await import('./analytics-consent')
    expect(readAnalyticsConsent()).toBeNull()
  })

  test('valor estranho no armazenamento não vale como aceite', async () => {
    const { ANALYTICS_CONSENT_KEY, readAnalyticsConsent } = await import(
      './analytics-consent'
    )
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'true')
    expect(readAnalyticsConsent()).toBeNull()
  })

  test('aceite e recusa ficam gravados e a última escolha vence', async () => {
    const { ANALYTICS_CONSENT_KEY, readAnalyticsConsent, setAnalyticsConsent } =
      await import('./analytics-consent')

    setAnalyticsConsent('granted')
    expect(readAnalyticsConsent()).toBe('granted')
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted')

    setAnalyticsConsent('denied')
    expect(readAnalyticsConsent()).toBe('denied')
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied')
  })

  test('armazenamento bloqueado: a escolha vale na aba em vez de sumir', async () => {
    const { readAnalyticsConsent, setAnalyticsConsent } = await import(
      './analytics-consent'
    )
    const bloqueado = () => {
      throw new Error('SecurityError')
    }
    dom.window.Storage.prototype.setItem = bloqueado
    dom.window.Storage.prototype.getItem = bloqueado

    // `granted`, e não `denied`: o teste anterior deixou `denied` na
    // memória do módulo, e repetir o valor não provaria nada.
    setAnalyticsConsent('granted')
    expect(readAnalyticsConsent()).toBe('granted')
  })
})

// O script do `<head>` decide, antes do primeiro paint, se o aviso aparece. Tem
// de concordar com `readAnalyticsConsent`, que decide o mesmo depois.
describe('script do <head> marca a escolha pendente', () => {
  async function rodar() {
    const { CONSENT_HEAD_SCRIPT } = await import('./analytics-consent')
    // O script fala com `localStorage` solto, como no navegador.
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => window.localStorage,
      configurable: true
    })
    new Function(CONSENT_HEAD_SCRIPT)()
    return document.documentElement.getAttribute('data-consent')
  }

  test('sem nada gravado: pendente', async () => {
    expect(await rodar()).toBe('pending')
  })

  test('aceite ou recusa gravados: não marca nada', async () => {
    const { ANALYTICS_CONSENT_KEY } = await import('./analytics-consent')
    for (const escolha of ['granted', 'denied']) {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, escolha)
      expect(await rodar()).toBeNull()
    }
  })

  test('valor estranho ou armazenamento bloqueado: pendente', async () => {
    const { ANALYTICS_CONSENT_KEY } = await import('./analytics-consent')
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'true')
    expect(await rodar()).toBe('pending')

    document.documentElement.removeAttribute('data-consent')
    dom.window.Storage.prototype.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(await rodar()).toBe('pending')
  })
})

describe('recusa apaga o que a análise gravou', () => {
  test('some com as chaves ph_ do localStorage e dos cookies, e só com elas', async () => {
    const { clearPosthogStorage } = await import('./posthog')
    const { ANALYTICS_CONSENT_KEY } = await import('./analytics-consent')

    window.localStorage.setItem('ph_phc_teste_posthog', '{"distinct_id":"x"}')
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied')
    window.localStorage.setItem('onside:pub-onboarding-draft', '{}')
    document.cookie = 'ph_phc_teste_posthog=abc; path=/'
    document.cookie = 'better-auth.session_token=sessao; path=/'

    clearPosthogStorage()

    expect(window.localStorage.getItem('ph_phc_teste_posthog')).toBeNull()
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied')
    expect(window.localStorage.getItem('onside:pub-onboarding-draft')).toBe(
      '{}'
    )
    expect(document.cookie).not.toContain('ph_phc_teste_posthog')
    expect(document.cookie).toContain('better-auth.session_token=sessao')
  })
})
