import ArrowRight from 'reicon-react/icons/ArrowRight'
import { OnsideFooter, OnsideHeader } from '@/components/landing/onside-landing'
import { FAN_CLOSING, GUIA_ARTICLES } from './guia-articles'
import { GUIA_DESCRIPTION, GUIA_PATH, GUIA_TITLE } from './guia-head'
import '@/components/legal/legal.css'

const HERO_ID = 'top'

/**
 * Índice do guia. Mesmo visual das páginas legais (`legal.css`): o topo com
 * título e introdução, e os artigos no cartão "Leia também" delas.
 */
export function GuiaIndexPage() {
  return (
    <div className="onside-page onside-legal">
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader home="/" inkHeroId={HERO_ID} />

      <main id="main">
        <section className="onside-legal-hero" id={HERO_ID}>
          <div className="onside-shell onside-legal-hero-grid">
            <div>
              <p className="onside-legal-kicker">
                <span aria-hidden="true" />
                Guia
              </p>
              <h1>
                {GUIA_TITLE}
                <span aria-hidden="true">.</span>
              </h1>
              <div className="onside-legal-intro">
                <p>{GUIA_DESCRIPTION}</p>
              </div>
            </div>

            <nav className="onside-legal-side" aria-label="Artigos do guia">
              {GUIA_ARTICLES.map((article) => (
                <a
                  key={article.slug}
                  className="onside-legal-other"
                  href={`${GUIA_PATH}/${article.slug}`}
                >
                  <span>
                    <span>{article.document.kicker}</span>
                    <b>{article.document.title}</b>
                    <span>{article.description}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" focusable="false" />
                </a>
              ))}
            </nav>
          </div>
        </section>

        <section className="onside-legal-contact">
          <div className="onside-shell">
            <div>
              <p>{FAN_CLOSING.kicker}</p>
              <h2>{FAN_CLOSING.title}</h2>
            </div>
            <a href={FAN_CLOSING.href}>
              {FAN_CLOSING.label}
              <ArrowRight size={16} aria-hidden="true" focusable="false" />
            </a>
          </div>
        </section>
      </main>

      <OnsideFooter home="/" />
    </div>
  )
}
