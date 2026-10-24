import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  type AnalyticsConsent,
  consentBannerEnabled,
  reviewAnalyticsConsent,
  setAnalyticsConsent,
  useAnalyticsConsent,
  useAnalyticsConsentReview
} from '@/lib/analytics-consent'

const CURRENT_CHOICE: Record<AnalyticsConsent, string> = {
  granted: 'Hoje você aceita os cookies de análise.',
  denied: 'Hoje você recusa os cookies de análise.'
}

/**
 * O aviso é fixo no rodapé da janela e cobriria o fim de qualquer página até
 * a pessoa escolher. Publica a própria altura em `--onside-consent-h`; o CSS
 * reserva esse espaço no fim do documento enquanto o aviso aparece. A altura
 * é medida porque muda com a largura e com o texto. Escondido ele mede 0.
 */
function reservarEspaco(aviso: HTMLElement) {
  if (typeof ResizeObserver === 'undefined') return
  const raiz = document.documentElement.style
  const observer = new ResizeObserver(() =>
    raiz.setProperty('--onside-consent-h', `${aviso.offsetHeight}px`)
  )
  observer.observe(aviso)
  return () => {
    observer.disconnect()
    raiz.removeProperty('--onside-consent-h')
  }
}

const PRIVACY_LINK = (
  <Link to="/privacidade" hash="s-8">
    Política de Privacidade
  </Link>
)

/**
 * Aviso de cookies (WEB-243). Aparece para quem ainda não escolheu, e de
 * novo quando a pessoa pede para rever a escolha. Não é modal: a página
 * continua usável, e nada de análise roda enquanto não houver aceite.
 *
 * O aviso sai sempre no HTML, igual no servidor e no cliente, e quem o mostra
 * é o `data-consent` do `<html>`: `pending` (sem escolha) ou `review`
 * (reaberto). No primeiro paint quem põe o `pending` é o script do `<head>`
 * (`CONSENT_HEAD_SCRIPT`), que lê a escolha antes de o React existir; daí em
 * diante é o efeito abaixo. Assim o aviso não surge depois da hidratação nem
 * pisca para quem já respondeu.
 *
 * Os dois textos também saem sempre: o CSS mostra o curto na barra do celular
 * e o completo no desktop, sem esperar JavaScript para saber a largura.
 */
export function CookieConsent() {
  const consent = useAnalyticsConsent()
  const reviewing = useAnalyticsConsentReview()

  useEffect(() => {
    // `ssr` é o render da hidratação: vale o que o script do `<head>` decidiu.
    // Sem aviso (dev sem PostHog), nada de `data-consent`: ele reservaria no
    // fim da página o espaço de um aviso que não aparece.
    if (consent === 'ssr' || !consentBannerEnabled()) return
    const root = document.documentElement
    if (consent === 'unset') root.setAttribute('data-consent', 'pending')
    else if (reviewing) root.setAttribute('data-consent', 'review')
    else root.removeAttribute('data-consent')
  }, [consent, reviewing])

  if (!consentBannerEnabled()) return null

  return (
    <section
      ref={reservarEspaco}
      className="onside-banner onside-consent"
      aria-label="Cookies"
      data-testid="cookie-consent"
    >
      <div>
        <p className="onside-consent-kicker">Cookies</p>
        <p className="onside-consent-long">
          Usamos cookies essenciais para a Onside funcionar. Com a sua
          permissão, usamos também cookies de análise para entender o uso e
          melhorar o produto. Detalhes na {PRIVACY_LINK}.
        </p>
        <p className="onside-consent-short">
          Usamos cookies de análise com a sua permissão. Detalhes na{' '}
          {PRIVACY_LINK}.
        </p>
        {consent === 'granted' || consent === 'denied' ? (
          <p className="onside-consent-current">{CURRENT_CHOICE[consent]}</p>
        ) : null}
      </div>
      <div className="onside-consent-actions">
        <button type="button" onClick={() => setAnalyticsConsent('denied')}>
          Recusar
        </button>
        <button
          type="button"
          className="is-accept"
          onClick={() => setAnalyticsConsent('granted')}
        >
          Aceitar
        </button>
      </div>
    </section>
  )
}

/** Reabre o aviso. Some onde a análise não existe: não há o que escolher. */
export function CookiePreferencesButton({ className }: { className?: string }) {
  if (!consentBannerEnabled()) return null
  return (
    <button
      type="button"
      className={className}
      onClick={reviewAnalyticsConsent}
    >
      Cookies
    </button>
  )
}
