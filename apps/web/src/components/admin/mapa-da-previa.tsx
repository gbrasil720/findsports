import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Enquadramento } from './mapa-maplibre'

const ESCURO = '(prefers-color-scheme: dark)'

/**
 * O mapa por baixo da gota na prévia (WEB-456). A caixa tem o tamanho final
 * desde o primeiro quadro, no tom do mapa; o MapLibre chega por `import()`
 * e o desenho entra por cima, em esmaecimento, quando os tiles carregam.
 * Sem WebGL ou sem rede, fica o tom liso: a gota e o resto continuam.
 * `children` são as peças do app por cima (gota, raio, você).
 */
export function MapaDaPrevia({
  enquadramento,
  className,
  children
}: {
  enquadramento: Enquadramento
  className: string
  children: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pronto, setPronto] = useState(false)
  const { centro, zoom, topo } = enquadramento
  const { lat, lng } = centro

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let fim: (() => void) | undefined
    let vivo = true
    setPronto(false)
    import('./mapa-maplibre')
      .then(({ criarMapa, estiloDoMapa }) => {
        if (!vivo) return
        const tema = window.matchMedia(ESCURO)
        const mapa = criarMapa(
          el,
          { centro: { lat, lng }, zoom, topo },
          tema.matches
        )
        mapa.once('idle', () => setPronto(true))
        const trocarTema = () =>
          mapa.setStyle(estiloDoMapa(tema.matches, window.location.origin))
        tema.addEventListener('change', trocarTema)
        fim = () => {
          tema.removeEventListener('change', trocarTema)
          mapa.remove()
        }
      })
      .catch(() => {})
    return () => {
      vivo = false
      fim?.()
    }
  }, [lat, lng, zoom, topo])

  return (
    <div className={`relative overflow-hidden bg-[var(--a-map)] ${className}`}>
      {/* O esmaecimento fica por fora: o MapLibre escreve classe no nó
          dele, e o React a apagaria ao trocar o `className`. */}
      <div
        aria-hidden="true"
        className={`h-full transition-opacity duration-300 ease-(--onside-ease-out) ${pronto ? 'opacity-100' : 'opacity-0'}`}
      >
        <div ref={caixa} className="h-full w-full" />
      </div>
      {children}
      <span className="pointer-events-none absolute right-4 bottom-2 text-[9px] text-[var(--a-muted)] opacity-70">
        © OpenStreetMap
      </span>
    </div>
  )
}
