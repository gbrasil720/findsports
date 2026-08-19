const SCRIPT_ID = 'onside-google-maps-script'
const CALLBACK_NAME = '__onsideInitMap'

declare global {
  interface Window {
    google?: typeof google
    __onsideInitMap?: () => void
  }
}

type LoadOptions = {
  apiKey: string | undefined
  channel?: string
}

type MapsUrlOptions = {
  apiKey: string
  channel: string
}

export type GoogleMapsRuntime = {
  api: typeof google.maps
  Map: typeof google.maps.Map
  /**
   * ESC-16: substitui `google.maps.Marker`, depreciado. Exige que o mapa
   * tenha sido criado com um Map ID — sem ele o marcador não renderiza e não
   * reclama.
   */
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement
  Circle: typeof google.maps.Circle
}

let loadPromise: Promise<GoogleMapsRuntime> | null = null
let rejectActiveLoad: ((reason: Error) => void) | null = null

export function buildGoogleMapsUrl({
  apiKey,
  channel
}: MapsUrlOptions): string {
  const params = new URLSearchParams({
    key: apiKey,
    loading: 'async',
    callback: CALLBACK_NAME
  })
  if (channel) params.set('channel', channel)
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`
}

function getScript(): HTMLScriptElement | null {
  return document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
}

/**
 * ESC-16: havia um caminho alternativo para APIs sem `importLibrary`, que
 * pegava os construtores de `google.maps` direto. Ele nunca rodava — a URL
 * montada aqui usa `loading: 'async'`, que é justamente o carregador em que
 * `importLibrary` existe — e não teria como oferecer `AdvancedMarkerElement`,
 * que só sai da biblioteca `marker`. Manter os dois caminhos significaria
 * carregar um deles com um marcador depreciado e nenhuma forma de saber qual
 * está em uso.
 */
async function getGoogleMapsRuntime(): Promise<GoogleMapsRuntime> {
  const maps = window.google?.maps
  if (!maps) throw new Error('Google Maps não foi inicializado')
  if (typeof maps.importLibrary !== 'function') {
    throw new Error('Google Maps carregou sem `importLibrary`')
  }

  const [mapsLibrary, markerLibrary] = await Promise.all([
    maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
    maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>
  ])
  if (
    typeof mapsLibrary.Map !== 'function' ||
    typeof markerLibrary.AdvancedMarkerElement !== 'function' ||
    typeof mapsLibrary.Circle !== 'function'
  ) {
    throw new Error('Google Maps carregou sem os construtores necessários')
  }

  return {
    api: maps,
    Map: mapsLibrary.Map,
    AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement,
    Circle: mapsLibrary.Circle
  }
}

export function loadGoogleMaps({ apiKey, channel = '' }: LoadOptions) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps requer um navegador'))
  }
  if (loadPromise) return loadPromise
  if (window.google?.maps) {
    loadPromise = getGoogleMapsRuntime().catch((reason: unknown) => {
      loadPromise = null
      throw reason
    })
    return loadPromise
  }
  if (!apiKey) {
    return Promise.reject(
      new Error(
        import.meta.env.DEV
          ? 'Missing Google Maps key (VITE_GOOGLE_MAPS_PUBLIC_KEY)'
          : 'Mapa temporariamente indisponível'
      )
    )
  }

  loadPromise = new Promise<GoogleMapsRuntime>((resolve, reject) => {
    const script = getScript() ?? document.createElement('script')
    let settled = false
    let runtimePromise: Promise<GoogleMapsRuntime> | null = null

    const cleanupHandlers = () => {
      script.onload = null
      script.onerror = null
      delete window.__onsideInitMap
      rejectActiveLoad = null
    }
    const succeed = (runtime: GoogleMapsRuntime) => {
      if (settled) return
      settled = true
      cleanupHandlers()
      resolve(runtime)
    }
    const fail = (reason: Error) => {
      if (settled) return
      settled = true
      cleanupHandlers()
      script.remove()
      loadPromise = null
      reject(reason)
    }

    rejectActiveLoad = fail
    const initializeRuntime = () => {
      runtimePromise ??= getGoogleMapsRuntime()
      runtimePromise.then(succeed, (reason: unknown) =>
        fail(
          reason instanceof Error
            ? reason
            : new Error('Falha ao inicializar o Google Maps')
        )
      )
    }
    window.__onsideInitMap = initializeRuntime
    script.onerror = () => fail(new Error('Falha ao carregar o Google Maps'))

    if (!script.isConnected) {
      script.id = SCRIPT_ID
      script.src = buildGoogleMapsUrl({ apiKey, channel })
      script.async = true
      document.head.appendChild(script)
    }
  })

  return loadPromise
}

export function resetGoogleMapsLoader(): void {
  rejectActiveLoad?.(new Error('Carregamento do Google Maps reiniciado'))
  rejectActiveLoad = null
  loadPromise = null
  delete window.__onsideInitMap
  const script = getScript()
  if (script) {
    script.onload = null
    script.onerror = null
    script.remove()
  }
}
