import { useId, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Menu from 'reicon-react/icons/Menu'
import Search from 'reicon-react/icons/Search'
import Xmark from 'reicon-react/icons/Xmark'

const ONSIDE_ICON_SRC = '/onside-icone-preto.png'

export function OnsideAppDemo() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const listId = useId()
  const mapId = useId()
  const isMap = view === 'map'

  function toggleView() {
    setView(isMap ? 'list' : 'map')
  }

  return (
    <figure className="onside-product-stage">
      <div className="onside-demo-visual">
        <div className="onside-demo-preview-badge">
          Prévia do dashboard · ainda não disponível
        </div>

        <div className="onside-stage-glow" aria-hidden="true" />

        <div className="onside-phone-shell">
          <div className="onside-phone-topbar">
            <span>19:42</span>
            <span>Pinheiros · SP</span>
            <span className="onside-signal-dot" aria-hidden="true" />
          </div>

          <div className="onside-phone-content">
            <div className="onside-app-brand-row">
              <div className="onside-app-symbol" aria-hidden="true">
                {/* biome-ignore lint/performance/noImgElement: landing uses static public asset without Next image pipeline */}
                <img
                  src={ONSIDE_ICON_SRC}
                  alt=""
                  width={34}
                  height={34}
                  decoding="async"
                />
              </div>
              <span className="onside-app-menu-glyph" aria-hidden="true">
                <Menu size={16} aria-hidden="true" focusable="false" />
              </span>
            </div>

            <div className="onside-search-box" aria-hidden="true">
              <span className="onside-inline-icon">
                <Search size={14} aria-hidden="true" focusable="false" />
              </span>
              <strong>Onde você assiste hoje?</strong>
              <kbd>
                <Xmark size={12} aria-hidden="true" focusable="false" />
              </kbd>
            </div>

            <div className="onside-match-card">
              <div className="onside-match-meta">
                <span className="onside-status-pill">DEMONSTRAÇÃO</span>
                <span>Brasileirão</span>
              </div>
              <div className="onside-score-row">
                <div>
                  <b>FLA</b>
                  <small>Flamengo</small>
                </div>
                <strong>
                  2 <i>×</i> 2
                </strong>
                <div className="onside-score-right">
                  <b>PAL</b>
                  <small>Palmeiras</small>
                </div>
              </div>
              <div className="onside-match-time">74&apos; · segundo tempo</div>
            </div>

            <div className="onside-results-head">
              <strong>Bares na prévia</strong>
              <button
                type="button"
                data-view-toggle
                aria-pressed={isMap}
                aria-controls={`${listId} ${mapId}`}
                aria-label={isMap ? 'Ver lista de bares' : 'Ver mapa de bares'}
                onClick={toggleView}
              >
                {isMap ? 'Ver lista' : 'Ver mapa'}
              </button>
            </div>

            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {isMap ? 'Visualização em mapa' : 'Visualização em lista'}
            </div>

            <div className="onside-demo-views">
              <div
                id={listId}
                className="onside-venue-list"
                data-list-view
                hidden={isMap}
              >
                <article className="onside-venue-card onside-venue-featured">
                  <div className="onside-venue-image onside-venue-one">
                    <span>MAIS PERTO</span>
                  </div>
                  <div className="onside-venue-body">
                    <div className="onside-venue-title">
                      <strong>Bar do Zé</strong>
                      <span>1,2 km</span>
                    </div>
                    <p>Pinheiros · aberto até 01:00</p>
                    <div className="onside-venue-tags">
                      <span>Preço médio $$</span>
                      <span>Som no jogo</span>
                      <span>3 telões</span>
                    </div>
                    <div className="onside-confirmed">
                      <i aria-hidden="true" /> Exemplo de grade confirmada
                    </div>
                  </div>
                </article>

                <article className="onside-venue-card onside-venue-compact">
                  <div>
                    <strong>Sports Central</strong>
                    <p>2,4 km · Vila Madalena</p>
                  </div>
                  <span>3 telões</span>
                </article>

                <article className="onside-venue-card onside-venue-compact">
                  <div>
                    <strong>The Red Lion</strong>
                    <p>3,1 km · Itaim</p>
                  </div>
                  <span>Torcida rubro-negra</span>
                </article>
              </div>

              <div
                id={mapId}
                className="onside-map-view"
                data-map-view
                hidden={!isMap}
              >
                <div className="onside-map-grid" aria-hidden="true" />
                <span
                  className="onside-map-pin onside-pin-a"
                  aria-hidden="true"
                >
                  1
                </span>
                <span
                  className="onside-map-pin onside-pin-b"
                  aria-hidden="true"
                >
                  2
                </span>
                <span
                  className="onside-map-pin onside-pin-c"
                  aria-hidden="true"
                >
                  3
                </span>
                <div className="onside-map-sheet">
                  <strong>Bar do Zé</strong>
                  <span>1,2 km · preço médio $$ · som no jogo</span>
                </div>
              </div>
            </div>
          </div>

          <div className="onside-phone-nav" aria-hidden="true">
            <span className="is-active">Hoje</span>
            <span>Mapa</span>
            <span>Buscar</span>
          </div>
        </div>

        <div
          className="onside-floating-note onside-note-confirmed"
          aria-hidden="true"
        >
          <span className="onside-check">
            <Check size={16} aria-hidden="true" focusable="false" />
          </span>
          <div>
            <b>Transmissão confirmada</b>
            <small>Atualizada pelo bar</small>
          </div>
        </div>
        <div
          className="onside-floating-note onside-note-city"
          aria-hidden="true"
        >
          <small>PRÓXIMA CIDADE</small>
          <b>Você decide.</b>
        </div>
      </div>

      <figcaption className="onside-demo-caption">
        Exemplo de como o dashboard da Onside pretende mostrar partidas e bares.
      </figcaption>
    </figure>
  )
}
