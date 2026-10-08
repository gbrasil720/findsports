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
 * O aviso é fixo no rodapé da janela e cobriria o fim de qualquer página até
 * a pessoa escolher. Publica a própria altura em `--onside-consent-h`; o CSS
 * reserva esse espaço no fim do documento enquanto o aviso existe. A altura é
 * medida porque muda com a largura: em tela estreita os botões vão para baixo
 * do texto.
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
      ref={reservarEspaco}
      className="onside-banner onside-consent"
      aria-label="Cookies"
      data-testid="cookie-consent"
    >
      <div>
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
