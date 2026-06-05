/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <explanation> */
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    google: any
    __findsportsInitMap?: () => void
  }
}

export type MapBar = {
  id: string
  name: string
  lat: number
  lng: number
  accent: 'orange' | 'blue' | 'black'
  occupancy: number
}

type Props = {
  bars: MapBar[]
  center?: { lat: number; lng: number }
  hoveredId?: string | null
  onHover?: (id: string | null) => void
  onSelect?: (id: string) => void
}

const COLORS = {
  orange: '#ff5a1f',
  blue: '#1e6bff',
  black: '#111111'
}

const SP_FALLBACK = { lat: -23.5466, lng: -46.6896 }

let loadPromise: Promise<void> | null = null
function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise

  const key = import.meta.env.VITE_GOOGLE_MAPS_PUBLIC_KEY
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID
  if (!key) return Promise.reject(new Error('Missing Google Maps key'))

  loadPromise = new Promise((resolve, reject) => {
    window.__findsportsInitMap = () => resolve()
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__findsportsInitMap${channel ? `&channel=${channel}` : ''}`
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })
  return loadPromise
}

function pinSvg(color: string, hot: boolean, big: boolean) {
  const scale = big ? 1.15 : 1
  const w = 36 * scale
  const h = 46 * scale
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 46">
  <defs>
    <filter id="s" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path filter="url(#s)" d="M18 1c8.8 0 16 7.1 16 15.9 0 11.4-14.2 26.4-15 27.2a1.4 1.4 0 0 1-2 0C16.2 43.3 2 28.3 2 16.9 2 8.1 9.2 1 18 1z" fill="${color}" stroke="white" stroke-width="2"/>
  <circle cx="18" cy="17" r="6.5" fill="white"/>
  ${hot ? `<circle cx="27" cy="9" r="5" fill="#ff5a1f" stroke="white" stroke-width="1.5"/>` : ''}
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function userDotSvg() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="10" fill="rgba(30,107,255,0.18)"/>
  <circle cx="11" cy="11" r="5" fill="#1e6bff" stroke="white" stroke-width="2"/>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function userDotIcon() {
  return {
    url: userDotSvg(),
    scaledSize: new window.google.maps.Size(22, 22),
    anchor: new window.google.maps.Point(11, 11)
  }
}

export function GoogleMap({
  bars,
  center,
  hoveredId,
  onHover,
  onSelect
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const userMarkerRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Inicializa o mapa com fallback — sem center ainda
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return
        const map = new window.google.maps.Map(containerRef.current, {
          center: center ?? SP_FALLBACK,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }
          ]
        })
        mapRef.current = map

        // Cria o marker do usuário na posição inicial
        userMarkerRef.current = new window.google.maps.Marker({
          position: center ?? SP_FALLBACK,
          map,
          icon: userDotIcon(),
          zIndex: 1
        })

        setReady(true)
      })
      .catch((e) => setError(e.message || 'Erro ao carregar mapa'))
    return () => {
      cancelled = true
    }
  }, [])

  // Quando a localização real chegar, recentra o mapa e move o dot do usuário
  useEffect(() => {
    if (!ready || !mapRef.current || !center) return

    mapRef.current.panTo(center)
    userMarkerRef.current?.setPosition(center)
  }, [center, ready])

  // Sincroniza markers dos bares
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const map = mapRef.current
    const existing = markersRef.current
    const seen = new Set<string>()

    bars.forEach((b) => {
      seen.add(b.id)
      const hot = b.occupancy >= 75
      const isHover = hoveredId === b.id
      const iconUrl = pinSvg(COLORS[b.accent], hot, isHover)

      let marker = existing.get(b.id)
      if (!marker) {
        marker = new window.google.maps.Marker({
          position: { lat: b.lat, lng: b.lng },
          map,
          title: b.name,
          icon: {
            url: iconUrl,
            scaledSize: new window.google.maps.Size(
              isHover ? 42 : 36,
              isHover ? 53 : 46
            ),
            anchor: new window.google.maps.Point(
              isHover ? 21 : 18,
              isHover ? 53 : 46
            )
          },
          zIndex: isHover ? 999 : 10
        })
        marker.addListener('mouseover', () => onHover?.(b.id))
        marker.addListener('mouseout', () => onHover?.(null))
        marker.addListener('click', () => onSelect?.(b.id))
        existing.set(b.id, marker)
      } else {
        marker.setIcon({
          url: iconUrl,
          scaledSize: new window.google.maps.Size(
            isHover ? 42 : 36,
            isHover ? 53 : 46
          ),
          anchor: new window.google.maps.Point(
            isHover ? 21 : 18,
            isHover ? 53 : 46
          )
        })
        marker.setZIndex(isHover ? 999 : 10)
      }
    })

    existing.forEach((m, id) => {
      if (!seen.has(id)) {
        m.setMap(null)
        existing.delete(id)
      }
    })
  }, [bars, hoveredId, ready, onHover, onSelect])

  if (error) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-zinc-100 text-center p-6">
        <div>
          <div className="text-sm font-bold text-zinc-700">
            Mapa indisponível
          </div>
          <div className="text-xs text-zinc-500 mt-1">{error}</div>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="absolute inset-0" />
}
