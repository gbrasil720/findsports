import 'maplibre-gl/dist/maplibre-gl.css'

import type {
  AddProtocolAction,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import {
  getRadiusZoom,
  isValidCoordinates,
  type RadiusKm,
  SAO_PAULO_FALLBACK
} from '@/domain/discovery'
import { CIRCULO_VAZIO, criarCirculoDeRaio } from '@/domain/geo-circle'
import { env } from '@/lib/env'
import { criarEstiloDoMapa } from '@/lib/map-style'
import {
  aplicarPino,
  criarConteudoDePino,
  criarPontoDoUsuario,
  type MapAccent
} from './map-icons'
import { MapBoundary, MapCanvas, MapLoadError } from './map-status'
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

/**
 * WEB-35 continua valendo, com outra causa: se o arquivo PMTiles não
 * responder, o MapLibre nunca emite `load` — ele fica esperando o TileJSON
 * que o protocolo devolve a partir do cabeçalho do arquivo. Sem este limite a
 * UI ficaria presa em "Carregando mapa…" para sempre.
 */
const TEMPO_LIMITE_MS = 15_000

const FONTE_DO_RAIO = 'raio'
const CAMADA_DO_RAIO_PREENCHIMENTO = 'raio-preenchimento'
const CAMADA_DO_RAIO_CONTORNO = 'raio-contorno'

type MapLibreModulo = typeof import('maplibre-gl')

type MarkerEntry = {
  marker: Marker
  /** O nó que recebe cor e escala. Ver `Pino` em `map-icons.ts` (Delta 2). */
  pintura: HTMLElement
  /**
   * Um cancelador por marcador. Click, hover e teclado entram com o mesmo
   * `signal`, então `abort()` solta os três de uma vez — no lugar do par
   * `MapsEventListener[]` + `soltarHover` que o SDK do Google exigia.
   */
  abortar: AbortController
  /** Último estado aplicado, para não reescrever o que não mudou (ESC-16). */
  estado?: MarkerVisualState
}

/**
 * O módulo do MapLibre, carregado uma vez e reusado.
 *
 * É `import()` dinâmico por dois motivos. O primeiro é o SSR: o TanStack
 * Start renderiza esta rota no servidor, e o MapLibre toca em `window` ao ser
 * avaliado. O segundo é peso: são ~800 kB que só interessam a quem chega numa
 * tela com mapa, e mantê-los fora do bundle inicial é o mesmo ganho que o
 * `<script>` tardio do Google dava — agora sem carregador escrito à mão.
 */
let moduloPromise: Promise<MapLibreModulo> | null = null

async function carregarMapLibre(): Promise<MapLibreModulo> {
  moduloPromise ??= (async () => {
    const [maplibre, { Protocol }] = await Promise.all([
      import('maplibre-gl'),
      import('pmtiles')
    ])
    // A URL do worker precisa vir do empacotador (WEB-73).
    //
    // Sem isto o MapLibre a monta sozinho, a partir do `import.meta.url` do
    // próprio módulo — `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
    // Nenhum empacotador enxerga essa construção, então o arquivo não é
    // emitido: em produção a URL resolve para `/assets/maplibre-gl-worker.mjs`,
    // que é 404.
    //
    // O sintoma é o pior possível: **nenhum erro**. O mapa é criado, o canvas
    // aparece, o estilo carrega — e nada é decodificado, porque é o worker que
    // transforma tile em geometria. A tela fica em "Carregando mapa…" para
    // sempre, e só o `TEMPO_LIMITE_MS` percebe.
    //
    // `?worker&url` faz o Vite empacotar o worker junto da dependência dele
    // (`maplibre-gl-shared.mjs`) e devolver a URL do arquivo emitido, com hash.
    // O `worker.format: 'es'` do `vite.config.ts` completa o par.
    maplibre.setWorkerUrl(workerUrl)
    // `pmtiles://` faz o MapLibre ler faixas de bytes do arquivo único por
    // HTTP Range, em vez de pedir um tile por requisição a um servidor. É o
    // que permite o basemap inteiro ser um objeto num bucket.
    maplibre.addProtocol(
      'pmtiles',
      new Protocol().tile as unknown as AddProtocolAction
    )
    return maplibre
  })().catch((reason: unknown) => {
    // Sem isto, uma falha de rede no chunk deixaria a promessa rejeitada em
    // cache e o botão "Tentar novamente" não teria como funcionar.
    moduloPromise = null
    throw reason
  })
  return moduloPromise
}

/**
 * Nem toda falha do mapa é passageira. `retriable` decide se a caixa de erro
 * mostra o botão de tentar de novo — ver `MapLoadError`.
 *
 * Com o Google havia um terceiro caso, o pior: `gm_authFailure`, a recusa de
 * chave. Era global, permanente e chegava DEPOIS de o mapa existir, então o
 * componente precisava de um observador global e de um estado que nunca
 * voltava. Sem chave e sem faturamento, esse estado deixou de existir: os
 * tiles são um arquivo público, e falha de arquivo público é falha de rede —
 * sempre vale tentar de novo.
 */
type MapError = { message: string; retriable: boolean }

function reportarFalhaDoMapa(reason: unknown): string {
  console.error('Erro do MapLibre isolado no componente:', reason)
  return 'Mapa temporariamente indisponível'
}

function getLoadError(error: unknown): string {
  if (import.meta.env.DEV && error instanceof Error) return error.message
  return 'Mapa temporariamente indisponível'
}

/**
 * O mapa vive atrás de uma fronteira de erro própria — ver `MapBoundary`.
 *
 * Toda conversa com o MapLibre acontece dentro de efeitos, e erro em efeito
 * sobe pelo commit do React até a fronteira de erro da rota se ninguém pegar
 * antes. Sem esta fronteira, um pino recusado apaga a tela inteira.
 */
export function OnsideMap(props: Props) {
  return (
    <MapBoundary>
      <MapaDaOnside {...props} />
    </MapBoundary>
  )
}

function MapaDaOnside({
  bars,
  center,
  showUserLocation = false,
  radiusKm,
  hoveredId,
  onHover,
  onSelect
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap>(null)
  const libRef = useRef<MapLibreModulo>(null)
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map())
  const userMarkerRef = useRef<Marker>(null)
  const centerRef = useRef(center)
  const onHoverRef = useRef(onHover)
  const onSelectRef = useRef(onSelect)
  const [error, setError] = useState<MapError | null>(null)
  const [ready, setReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  centerRef.current = center
  onHoverRef.current = onHover
  onSelectRef.current = onSelect

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey intentionally restarts the imperative map lifecycle
  useEffect(() => {
    let cancelado = false
    let tempoLimite: ReturnType<typeof setTimeout> | null = null
    setError(null)
    setReady(false)

    // Sem o arquivo de tiles não há mapa nenhum, e o MapLibre não reclamaria:
    // ele desenharia o fundo vazio do estilo. Falhar aqui, alto, troca uma
    // tela cinza sem explicação por uma que se lê.
    const tilesUrl = env.VITE_MAP_TILES_URL
    if (!tilesUrl) {
      setError({
        message: import.meta.env.DEV
          ? 'Falta VITE_MAP_TILES_URL: sem o arquivo PMTiles o mapa fica vazio.'
          : 'Mapa temporariamente indisponível',
        retriable: false
      })
      return
    }

    carregarMapLibre()
      .then((maplibre) => {
        if (cancelado || !containerRef.current) return
        libRef.current = maplibre

        const mapa = new maplibre.Map({
          container: containerRef.current,
          style: criarEstiloDoMapa(tilesUrl, window.location.origin),
          center: centerRef.current ?? SAO_PAULO_FALLBACK,
          zoom: 14,
          // Paridade com `gestureHandling: 'cooperative'`: a roda do mouse só
          // dá zoom com Ctrl, e um dedo só arrasta a página.
          cooperativeGestures: true,
          // O mapa é ortogonal, como o resto da identidade. Girar e inclinar
          // não tinham equivalente no Google (`disableDefaultUI`) e só
          // ofereceriam um jeito de sair do enquadramento sem querer.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true }
        })
        mapRef.current = mapa
        // Paridade com `disableDefaultUI: true` + `zoomControl: true`: só o
        // par de botões de zoom, no mesmo canto em que o Google os punha.
        mapa.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          'bottom-right'
        )

        mapa.once('load', () => {
          if (cancelado) return
          if (tempoLimite !== null) clearTimeout(tempoLimite)
          // A fonte do raio nasce vazia: o efeito de câmera preenche quando
          // houver centro e raio. Criar aqui evita ter que checar "a camada
          // já existe?" a cada mudança de filtro.
          mapa.addSource(FONTE_DO_RAIO, {
            type: 'geojson',
            data: CIRCULO_VAZIO
          })
          mapa.addLayer({
            id: CAMADA_DO_RAIO_PREENCHIMENTO,
            type: 'fill',
            source: FONTE_DO_RAIO,
            paint: { 'fill-color': '#C9F135', 'fill-opacity': 0.18 }
          })
          mapa.addLayer({
            id: CAMADA_DO_RAIO_CONTORNO,
            type: 'line',
            source: FONTE_DO_RAIO,
            paint: {
              'line-color': '#C9F135',
              'line-opacity': 0.55,
              'line-width': 1.5
            }
          })
          setReady(true)
        })

        // Tile que falta ou tile que não baixou não derruba o mapa: o
        // MapLibre segue desenhando o resto. Vai para o console, onde é útil,
        // e não para a tela, onde trocaria um mapa quase inteiro por um
        // cartão de erro.
        mapa.on('error', (evento) => {
          console.error('Erro do MapLibre:', evento.error ?? evento)
        })

        tempoLimite = setTimeout(() => {
          if (!cancelado) {
            setError({
              message: import.meta.env.DEV
                ? 'Tempo esgotado ao carregar os tiles. Ver o console.'
                : 'Mapa temporariamente indisponível',
              retriable: true
            })
          }
        }, TEMPO_LIMITE_MS)
      })
      .catch((reason: unknown) => {
        if (!cancelado) {
          setError({ message: getLoadError(reason), retriable: true })
        }
      })

    return () => {
      cancelado = true
      if (tempoLimite !== null) clearTimeout(tempoLimite)
      // A limpeza roda na fase passiva, ou seja, DEPOIS de o React já ter
      // tirado o contêiner do documento. Nada aqui pode lançar: um erro nesta
      // função sobe pelo commit e derruba a tela para a qual estamos
      // navegando.
      try {
        for (const entry of markersRef.current.values()) {
          entry.abortar.abort()
          entry.marker.remove()
        }
        userMarkerRef.current?.remove()
        // O `map-liveness.ts` existia porque o SDK do Google não tinha
        // `destroy()`: a instância continuava viva, e `getDiv()` passava a
        // devolver `undefined` num mapa desmontado, o que estourava dentro do
        // commit do React. `remove()` desfaz tudo — canvas, ouvintes,
        // workers — e o arquivo inteiro pôde ser apagado.
        mapRef.current?.remove()
      } catch (reason) {
        console.error('Falha ao desmontar o mapa:', reason)
      }
      // Fora do `try`: se a desmontagem parar no meio, as refs ainda precisam
      // ficar limpas, senão a próxima montagem herda pinos de um mapa morto.
      markersRef.current.clear()
      mapRef.current = null
      libRef.current = null
      userMarkerRef.current = null
    }
  }, [retryKey])

  useEffect(() => {
    const mapa = mapRef.current
    const maplibre = libRef.current
    if (!ready || !mapa || !maplibre) return

    try {
      const centroValido = center && isValidCoordinates(center)

      if (centroValido) {
        mapa.easeTo({
          center: [center.lng, center.lat],
          ...(radiusKm ? { zoom: getRadiusZoom(radiusKm) } : {})
        })
      }

      if (showUserLocation && centroValido) {
        userMarkerRef.current ??= (() => {
          const elemento = criarPontoDoUsuario()
          elemento.title = 'Sua localização'
          // O ponto do usuário fica sob os pinos de bar: ele diz onde a
          // pessoa está, não é um resultado para clicar.
          elemento.style.zIndex = '1'
          // `anchor: 'center'` marca a coordenada exata. Era o que o
          // `translateY(50%)` no CSS emulava por cima da âncora de base do
          // marcador do Google.
          return new maplibre.Marker({ element: elemento, anchor: 'center' })
        })()
        userMarkerRef.current.setLngLat([center.lng, center.lat]).addTo(mapa)
      } else {
        userMarkerRef.current?.remove()
      }

      // Delta 1 do WEB-73: o `google.maps.Circle` virou um polígono geodésico
      // numa fonte GeoJSON. Trocar o raio é uma chamada só — mais barato que
      // o `setCenter` + `setRadius` de antes.
      const fonteDoRaio = mapa.getSource(FONTE_DO_RAIO) as
        | GeoJSONSource
        | undefined
      fonteDoRaio?.setData(
        radiusKm && centroValido
          ? criarCirculoDeRaio(center, radiusKm)
          : CIRCULO_VAZIO
      )
    } catch (reason) {
      // Degradar para o cartão de erro custa o mapa. Deixar subir custa a
      // rota inteira.
      setError({ message: reportarFalhaDoMapa(reason), retriable: true })
    }
  }, [center, radiusKm, ready, showUserLocation])

  useEffect(() => {
    const mapa = mapRef.current
    const maplibre = libRef.current
    if (!ready || !mapa || !maplibre) return
    const seen = new Set<string>()

    try {
      for (const bar of bars) {
        if (!isValidCoordinates(bar)) continue
        seen.add(bar.id)
        const large = hoveredId === bar.id
        let entry = markersRef.current.get(bar.id)
        if (!entry) {
          const { raiz, pintura } = criarConteudoDePino()
          const abortar = new AbortController()
          const { signal } = abortar

          const entrou = () => onHoverRef.current?.(bar.id)
          const saiu = () => onHoverRef.current?.(null)
          raiz.addEventListener('mouseenter', entrou, { signal })
          raiz.addEventListener('mouseleave', saiu, { signal })

          // Só o mapa que leva a algum lugar vira botão.
          //
          // O marcador do Google entrava na navegação por teclado sozinho com
          // `gmpClickable: true`; o do MapLibre é um `<div>` cru, e sem estas
          // linhas o mapa seria alcançável só com mouse. Mas a página pública
          // do bar monta o mapa dentro de um contêiner `aria-hidden` e sem
          // `onSelect` — ali um pino focável seria um elemento tabulável dentro
          // de conteúdo escondido, que é falha de acessibilidade, e um cursor
          // de ponteiro sobre algo que não clica.
          if (onSelectRef.current) {
            raiz.tabIndex = 0
            raiz.setAttribute('role', 'button')
            raiz.style.cursor = 'pointer'
            const selecionar = () => onSelectRef.current?.(bar.id)
            raiz.addEventListener('click', selecionar, { signal })
            raiz.addEventListener(
              'keydown',
              (evento) => {
                if (evento.key !== 'Enter' && evento.key !== ' ') return
                // Espaço rolaria a página por baixo do mapa.
                evento.preventDefault()
                selecionar()
              },
              { signal }
            )
            // Foco leva ao mesmo destaque do hover: quem navega por teclado vê
            // na lista o mesmo que quem passa o mouse.
            raiz.addEventListener('focus', entrou, { signal })
            raiz.addEventListener('blur', saiu, { signal })
          }

          const marker = new maplibre.Marker({
            element: raiz,
            // A ponta do pino é que aponta o endereço.
            anchor: 'bottom'
          })
            .setLngLat([bar.lng, bar.lat])
            .addTo(mapa)

          entry = { marker, pintura, abortar }
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
            entry.marker.setLngLat([estado.lng, estado.lat])
          }
          if (updates.title) {
            const raiz = entry.marker.getElement()
            raiz.title = estado.name
            raiz.setAttribute('aria-label', estado.name)
          }
          if (updates.icon) {
            aplicarPino(entry.pintura, estado.accent, estado.large)
          }
          if (updates.zIndex) {
            // O MapLibre não escreve `zIndex` no elemento do marcador, então
            // esta é a única dona da propriedade — mesma escrita de antes.
            entry.marker.getElement().style.zIndex = estado.large ? '999' : '10'
          }
          entry.estado = estado
        }
      }

      for (const [id, entry] of markersRef.current) {
        if (seen.has(id)) continue
        // Um `abort()` solta click, teclado e hover de uma vez.
        entry.abortar.abort()
        entry.marker.remove()
        markersRef.current.delete(id)
      }
    } catch (reason) {
      setError({ message: reportarFalhaDoMapa(reason), retriable: true })
    }
  }, [bars, hoveredId, ready])

  if (error) {
    return (
      <MapLoadError
        message={error.message}
        onRetry={
          error.retriable ? () => setRetryKey((key) => key + 1) : undefined
        }
      />
    )
  }

  return <MapCanvas containerRef={containerRef} ready={ready} />
}
