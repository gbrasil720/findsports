import { afterEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  fitHeroToConsentBar,
  HERO_CONSENT_FIT_SCRIPT
} from './hero-consent-fit'

/**
 * O jsdom não faz layout, então as medidas entram à mão: uma tela de 800px,
 * barra de 100px no pé, arte de 300px e a chamada terminando em `ctaBottom`.
 * O que se trava aqui é a decisão; a medida de verdade é do E2E
 * (`tests/smoke/cookie-consent.e2e.ts`).
 */
let dom: JSDOM

function montar({
  consent = 'pending',
  ctaBottom,
  position = 'relative'
}: {
  consent?: string | null
  ctaBottom: number
  position?: string
}) {
  dom = new JSDOM(`<!doctype html><html><body>
    <section class="onside-consent"></section>
    <section class="onside-hero">
      <div class="onside-hero-stage"></div>
      <a data-cta="hero_signup" href="/signup">Criar conta</a>
    </section>
  </body></html>`)
  const { window } = dom
  for (const chave of ['window', 'document', 'getComputedStyle'] as const) {
    Object.defineProperty(globalThis, chave, {
      value: window[chave],
      configurable: true
    })
  }
  if (consent) window.document.documentElement.dataset.consent = consent
  const medidas = (seletor: string, valores: Record<string, unknown>) => {
    const el = window.document.querySelector(seletor)
    for (const [nome, valor] of Object.entries(valores)) {
      Object.defineProperty(el, nome, { value: valor, configurable: true })
    }
  }
  Object.defineProperty(window, 'innerHeight', { value: 800 })
  medidas('.onside-consent', { offsetHeight: 100 })
  medidas('.onside-hero-stage', { offsetHeight: 300 })
  medidas('[data-cta]', {
    offsetHeight: 60,
    offsetTop: ctaBottom - 60,
    offsetParent: null
  })
  ;(
    window.document.querySelector('.onside-hero-stage') as HTMLElement
  ).style.position = position
  return () =>
    window.document.documentElement.style.getPropertyValue('--onside-hero-art')
}

afterEach(() => {
  dom.window.close()
})

describe('fitHeroToConsentBar', () => {
  test('a chamada termina debaixo da barra: a arte cede o que falta mais 16px', () => {
    // Barra em 700. A chamada termina em 760: sobe 76, e a arte fica com 224.
    const arte = montar({ ctaBottom: 760 })
    fitHeroToConsentBar()
    expect(arte()).toBe('224px')
  })

  test('a chamada já termina acima da barra: o hero fica como é', () => {
    const arte = montar({ ctaBottom: 640 })
    fitHeroToConsentBar()
    expect(arte()).toBe('')
  })

  test('não cabe nem com a arte no mínimo: o hero fica como é', () => {
    // Precisaria subir 216 e deixaria 84px de arte, menos que o mínimo de 112.
    const arte = montar({ ctaBottom: 900 })
    fitHeroToConsentBar()
    expect(arte()).toBe('')
  })

  test('sem escolha pendente, apaga o que tinha publicado', () => {
    const arte = montar({ consent: null, ctaBottom: 760 })
    document.documentElement.style.setProperty('--onside-hero-art', '224px')
    fitHeroToConsentBar()
    expect(arte()).toBe('')
  })

  test('hero em paisagem (palco absoluto) não entra na conta', () => {
    const arte = montar({ ctaBottom: 760, position: 'absolute' })
    fitHeroToConsentBar()
    expect(arte()).toBe('')
  })

  test('o texto que vai inline no HTML roda sozinho e dá o mesmo resultado', () => {
    const arte = montar({ ctaBottom: 760 })
    new Function(HERO_CONSENT_FIT_SCRIPT)()
    expect(arte()).toBe('224px')
  })
})
