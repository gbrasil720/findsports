import { Link } from '@tanstack/react-router'
import {
  type AnalyticsConsent,
  analyticsConfigured,
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
 * Aviso de cookies (WEB-243). Aparece para quem ainda não escolheu, e de
 * novo quando a pessoa pede para rever a escolha. Não é modal: a página
 * continua usável, e nada de análise roda enquanto não houver aceite.
 */
export function CookieConsent() {
  const consent = useAnalyticsConsent()
  const reviewing = useAnalyticsConsentReview()

  if (!analyticsConfigured()) return null
  if (consent === 'ssr') return null
  if (consent !== 'unset' && !reviewing) return null

  return (
    <section
      className="onside-banner onside-consent"
      aria-label="Cookies"
      data-testid="cookie-consent"
    >
      <div className="onside-consent-copy">
        <p className="onside-consent-kicker">Cookies</p>
        <p>
          Usamos cookies essenciais para a Onside funcionar. Com a sua
          permissão, usamos também cookies de análise para entender o uso e
          melhorar o produto. Detalhes na{' '}
          <Link to="/privacidade" hash="s-8">
            Política de Privacidade
          </Link>
          .
        </p>
        {consent !== 'unset' ? (
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
  if (!analyticsConfigured()) return null
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
