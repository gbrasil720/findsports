import { useEffect, useRef, useState } from 'react'
import {
  getRadiusZoom,
  isValidCoordinates,
  type RadiusKm,
  SAO_PAULO_FALLBACK
} from '@/domain/discovery'
import {
  type GoogleMapsRuntime,
  loadGoogleMaps,
  resetGoogleMapsLoader
} from '@/lib/google-maps-loader'
import {
  createPinIcon,
  createUserDotIcon,
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
  marker: google.maps.Marker
  listeners: google.maps.MapsEventListener[]
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
  const userMarkerRef = useRef<google.maps.Marker>(null)
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
    loadGoogleMaps({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_PUBLIC_KEY,
      channel: import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID
    })
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
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }
          ]
        })
        setReady(true)
      })
      .catch((reason: unknown) => setError(getLoadError(reason)))

    return () => {
      cancelled = true
      for (const { marker, listeners } of markersRef.current.values()) {
        for (const listener of listeners) listener.remove()
        marker.setMap(null)
      }
      markersRef.current.clear()
      userMarkerRef.current?.setMap(null)
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
      userMarkerRef.current ??= new runtime.Marker({
        icon: createUserDotIcon(runtime.api),
        zIndex: 1,
        title: 'Sua localização'
      })
      userMarkerRef.current.setMap(map)
      userMarkerRef.current.setPosition(center)
    } else {
      userMarkerRef.current?.setMap(null)
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
        const marker = new runtime.Marker({ map })
        entry = {
          marker,
          listeners: [
            marker.addListener('mouseover', () => onHoverRef.current?.(bar.id)),
            marker.addListener('mouseout', () => onHoverRef.current?.(null)),
            marker.addListener('click', () => onSelectRef.current?.(bar.id))
          ]
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
          entry.marker.setPosition({ lat: estado.lat, lng: estado.lng })
        }
        if (updates.title) entry.marker.setTitle(estado.name)
        if (updates.icon) {
          entry.marker.setIcon(
            createPinIcon(runtime.api, estado.accent, estado.large)
          )
        }
        if (updates.zIndex) entry.marker.setZIndex(estado.large ? 999 : 10)
        entry.estado = estado
      }
    }

    for (const [id, entry] of markersRef.current) {
      if (seen.has(id)) continue
      for (const listener of entry.listeners) listener.remove()
      entry.marker.setMap(null)
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
