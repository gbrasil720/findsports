import { Link } from '@tanstack/react-router'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { OnsideBrand, OnsideMark } from '@/components/brand/onside-brand'
import './not-found-page.css'

const BROKEN_MARK_SRC = '/onside-icone-preto-broken.png'
const YEAR = new Date().getFullYear()

export function NotFoundPage() {
  return (
    <div className="onside-page onside-not-found">
      <a className="onside-not-found-skip" href="#not-found-main">
        Pular para o conteúdo
      </a>

      <div className="onside-not-found-frame">
        <header className="onside-not-found-header">
          <Link
            to="/"
            className="onside-not-found-brand"
            aria-label="Onside — página inicial"
          >
            <OnsideBrand />
          </Link>
          <p className="onside-not-found-tagline">
            A casa do esporte.
            <br />
            Do seu jeito.
          </p>
        </header>

        <main id="not-found-main" className="onside-not-found-main">
          <div className="onside-not-found-copy">
            <p className="onside-not-found-kicker">Erro 404</p>
            <h1 className="onside-not-found-title">
              Essa página
              <br />
              <span className="onside-not-found-title-line">
                saiu de campo
                <span className="onside-not-found-dot" aria-hidden="true" />
              </span>
            </h1>
            <p className="onside-not-found-lead">
              O link pode estar quebrado
              <br />
              ou a página não existe mais.
            </p>
            <div className="onside-not-found-actions">
              <Link to="/" className="onside-not-found-cta">
                Voltar para a home
                <span className="onside-not-found-cta-icon" aria-hidden="true">
                  <ArrowRight size={16} aria-hidden="true" focusable="false" />
                </span>
              </Link>
              <Link to="/dashboard" className="onside-not-found-secondary">
                Ir para bares perto de você
                <span aria-hidden="true">
                  <ArrowRight size={14} aria-hidden="true" focusable="false" />
                </span>
              </Link>
            </div>
          </div>

          <div className="onside-not-found-visual" aria-hidden="true">
            {/* biome-ignore lint/performance/noImgElement: static public brand asset */}
            <img
              src={BROKEN_MARK_SRC}
              alt=""
              width={1420}
              height={1108}
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </main>

        <footer className="onside-not-found-footer">
          <p className="onside-not-found-score">
            <OnsideMark size={22} />
            <span>
              Placar final: <strong>404</strong>
            </span>
          </p>
          <p className="onside-not-found-legal">
            Onside © {YEAR}
            <span aria-hidden="true"> • </span>
            Todos os direitos reservados
          </p>
        </footer>
      </div>
    </div>
  )
}
