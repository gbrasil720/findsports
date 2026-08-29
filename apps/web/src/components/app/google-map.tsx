import { useEffect, useRef, useState } from 'react'
import {
  getRadiusZoom,
  isValidCoordinates,
  type RadiusKm,
  SAO_PAULO_FALLBACK
} from '@/domain/discovery'
import { env } from '@/lib/env'
import {
  type GoogleMapsRuntime,
  loadGoogleMaps,
  resetGoogleMapsLoader
} from '@/lib/google-maps-loader'
import {
  aplicarPino,
  criarConteudoDePino,
  criarPontoDoUsuario,
  type MapAccent
} from './google-map-icons'
import { MapCanvas, MapLoadError } from './google-map-status'
import {
  diffMarkerState,
  type MarkerVisualState,
  nenhumaMudanca
} from './marker-diff'

export type MapBar = {
  id: string
  name: string
  lat: number
  lng: number
  accent: MapAccent
}

type Props = {
  bars: MapBar[]
  center?: { lat: number; lng: number }
  showUserLocation?: boolean
  radiusKm?: RadiusKm
  hoveredId?: string | null
  onHover?: (id: string | null) => void
  onSelect?: (id: string) => void
}

type MarkerEntry = {
  marker: google.maps.marker.AdvancedMarkerElement
  /** O nó que recebe o SVG. Um por marcador — DOM não se compartilha. */
  conteudo: HTMLElement
  listeners: google.maps.MapsEventListener[]
  /**
   * `AdvancedMarkerElement` não emite `mouseover`/`mouseout` pelo barramento
   * do mapa: ele É um `HTMLElement`, então o hover vem do DOM e sai por
   * `removeEventListener`, não por `listener.remove()`.
   */
  soltarHover: () => void
  /** Último estado aplicado, para não reescrever o que não mudou (ESC-16). */
  estado?: MarkerVisualState
}

function getLoadError(error: unknown): string {
  if (error instanceof Error && !error.message.includes('key')) {
    return error.message
  }
  return 'Mapa temporariamente indisponível'
}

export function GoogleMap({
  bars,
  center,
  showUserLocation = false,
  radiusKm,
  hoveredId,
  onHover,
  onSelect
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map>(null)
  const runtimeRef = useRef<GoogleMapsRuntime>(null)
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map())
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement>(null)
  const radiusCircleRef = useRef<google.maps.Circle>(null)
  const centerRef = useRef(center)
  const onHoverRef = useRef(onHover)
  const onSelectRef = useRef(onSelect)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  centerRef.current = center
  onHoverRef.current = onHover
  onSelectRef.current = onSelect

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey intentionally restarts the imperative loader lifecycle
  useEffect(() => {
    let cancelled = false
    setError(null)
    setReady(false)
    // `channel` era `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID`, que não
    // existe em `.env` nenhum — sempre chegou `undefined` no carregador.
    // Resto de andaime do gerador; o parâmetro segue opcional em
    // `loadGoogleMaps` para quem um dia quiser medir por canal.
    // ESC-16: sem Map ID o `AdvancedMarkerElement` não renderiza — e não
    // reclama. O mapa apareceria vazio, sem erro no console e sem nada
    // apontando para a causa. Falhar aqui, alto, troca essa falha silenciosa
    // por uma que se lê na tela.
    const mapId = env.VITE_GOOGLE_MAPS_MAP_ID
    if (!mapId) {
      setError(
        import.meta.env.DEV
          ? 'Falta VITE_GOOGLE_MAPS_MAP_ID: sem Map ID os pinos não renderizam.'
          : 'Mapa temporariamente indisponível'
      )
      return
    }

    loadGoogleMaps({ apiKey: env.VITE_GOOGLE_MAPS_PUBLIC_KEY })
      .then((runtime) => {
        if (cancelled || !containerRef.current) return
        runtimeRef.current = runtime
        mapRef.current = new runtime.Map(containerRef.current, {
          center: centerRef.current ?? SAO_PAULO_FALLBACK,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          clickableIcons: false,
          // `styles` era usado para esconder POI e transporte. Com `mapId` a
          // API ignora estilo definido em código — a estilização passa a vir
          // da nuvem, presa ao próprio Map ID. O estilo equivalente está
          // associado ao `onside-web` no console.
          mapId
        })
        setReady(true)
      })
      .catch((reason: unknown) => setError(getLoadError(reason)))

    return () => {
      cancelled = true
      for (const entry of markersRef.current.values()) {
        for (const listener of entry.listeners) listener.remove()
        entry.soltarHover()
        entry.marker.map = null
      }
      markersRef.current.clear()
      if (userMarkerRef.current) userMarkerRef.current.map = null
      radiusCircleRef.current?.setMap(null)
      const map = mapRef.current
      if (map && runtimeRef.current)
        runtimeRef.current.api.event.clearInstanceListeners(map)
      mapRef.current = null
      runtimeRef.current = null
      userMarkerRef.current = null
      radiusCircleRef.current = null
    }
  }, [retryKey])

  useEffect(() => {
    const map = mapRef.current
    const runtime = runtimeRef.current
    if (!ready || !map || !runtime) return
    if (center && isValidCoordinates(center)) {
      map.panTo(center)
      if (radiusKm) map.setZoom(getRadiusZoom(radiusKm))
    }

    if (showUserLocation && center && isValidCoordinates(center)) {
      userMarkerRef.current ??= new runtime.AdvancedMarkerElement({
        content: criarPontoDoUsuario(),
        zIndex: 1,
        title: 'Sua localização'
      })
      userMarkerRef.current.map = map
      userMarkerRef.current.position = center
    } else if (userMarkerRef.current) {
      userMarkerRef.current.map = null
    }

    if (radiusKm && center && isValidCoordinates(center)) {
      radiusCircleRef.current ??= new runtime.Circle({
        fillColor: '#C9F135',
        fillOpacity: 0.18,
        strokeColor: '#C9F135',
        strokeOpacity: 0.55,
        strokeWeight: 1.5,
        clickable: false,
        zIndex: 0
      })
      radiusCircleRef.current.setMap(map)
      radiusCircleRef.current.setCenter(center)
      radiusCircleRef.current.setRadius(radiusKm * 1000)
    } else {
      radiusCircleRef.current?.setMap(null)
    }
  }, [center, radiusKm, ready, showUserLocation])

  useEffect(() => {
    const map = mapRef.current
    const runtime = runtimeRef.current
    if (!ready || !map || !runtime) return
    const seen = new Set<string>()

    for (const bar of bars) {
      if (!isValidCoordinates(bar)) continue
      seen.add(bar.id)
      const large = hoveredId === bar.id
      let entry = markersRef.current.get(bar.id)
      if (!entry) {
        const conteudo = criarConteudoDePino()
        const marker = new runtime.AdvancedMarkerElement({
          map,
          content: conteudo,
          // Sem isto o marcador não emite `gmp-click` nem entra na navegação
          // por teclado.
          gmpClickable: true
        })

        // Hover vem do DOM: `AdvancedMarkerElement` não publica
        // `mouseover`/`mouseout` no barramento do mapa. Os ouvintes ficam no
        // próprio marcador, que é um `HTMLElement`, e não no conteúdo —
        // trocar o SVG por dentro não os derruba.
        const entrou = () => onHoverRef.current?.(bar.id)
        const saiu = () => onHoverRef.current?.(null)
        marker.addEventListener('mouseenter', entrou)
        marker.addEventListener('mouseleave', saiu)

        entry = {
          marker,
          conteudo,
          listeners: [
            marker.addListener('gmp-click', () => onSelectRef.current?.(bar.id))
          ],
          soltarHover: () => {
            marker.removeEventListener('mouseenter', entrou)
            marker.removeEventListener('mouseleave', saiu)
          }
        }
        markersRef.current.set(bar.id, entry)
      }
      // ESC-16: o efeito roda a cada mudança de hover. Sem comparar, os
      // quatro setters seriam chamados em todos os pinos a cada movimento do
      // mouse, quando no máximo dois mudam de aparência.
      const estado: MarkerVisualState = {
        lat: bar.lat,
        lng: bar.lng,
        name: bar.name,
        accent: bar.accent,
        large
      }
      const updates = diffMarkerState(entry.estado, estado)
      if (!nenhumaMudanca(updates)) {
        if (updates.position) {
          entry.marker.position = { lat: estado.lat, lng: estado.lng }
        }
        if (updates.title) entry.marker.title = estado.name
        if (updates.icon) {
          aplicarPino(entry.conteudo, estado.accent, estado.large)
        }
        if (updates.zIndex) entry.marker.zIndex = estado.large ? 999 : 10
        entry.estado = estado
      }
    }

    for (const [id, entry] of markersRef.current) {
      if (seen.has(id)) continue
      for (const listener of entry.listeners) listener.remove()
      entry.soltarHover()
      entry.marker.map = null
      markersRef.current.delete(id)
    }
  }, [bars, hoveredId, ready])

  if (error) {
    return (
      <MapLoadError
        message={error}
        onRetry={() => {
          resetGoogleMapsLoader()
          setRetryKey((key) => key + 1)
        }}
      />
    )
  }

  return <MapCanvas containerRef={containerRef} ready={ready} />
}
