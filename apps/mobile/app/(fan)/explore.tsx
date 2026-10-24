import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import MapView, { Marker } from 'react-native-maps'
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  BarRow,
  BarTicket,
  Chip,
  dayLabel,
  dropBox,
  initials as initialsOf,
  MapDrop,
  MapGroup,
  MeDot,
  QuietDot,
  RadiusCircle,
  type SearchBar
} from '@/components/explore'
import { useExploreState, useShotSource } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { EASE, haptic, POP_FAST, ScalePress } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime, greeting, isLive, searchCenter } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import {
  activeCount,
  applyShortcut,
  defaultShortcuts,
  searchInput,
  searchRadius,
  shortcutLabel,
  shortcutOn
} from '@/lib/filters'
import {
  expandGroup,
  hoodNames,
  indexCache,
  type Layer,
  type MapBar,
  mapLayers,
  type Region
} from '@/lib/map-layers'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * "Explorar" (2d e 2e do design): o mapa dos bares com jogo por perto, o
 * cabeçalho com a saudação, os filtros em chips de vidro, a lista numa folha
 * que arrasta; a barra de abas nativa e o menu "Você" ficam em `_layout`. O mapa
 * é o nativo: Apple Maps apagado no iOS, Google Maps com as cores da Onside
 * no Android (`lib/map-style.ts`).
 */

/** O dia de hoje em Brasília, como `pubs.search` recebe (`AAAA-MM-DD`). */
const today = () => brasiliaDay(Date.now())

/**
 * `capture`: esta é a tela que a aba "Você" fotografa para pôr sob o menu.
 * A cópia de reserva da "Você" (antes da primeira foto) não se fotografa.
 */
export default function Explore({ capture = true }: { capture?: boolean }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const palette = usePalette()
  const session = authClient.useSession()
  const soon = useSoon()
  const tabSpace = useTabBarSpace()
  useStatusBar(palette.dark ? 'light' : 'dark')

  // De onde a busca parte: o aparelho (se já deu permissão), a cidade do
  // perfil ou São Paulo. Localização, filtros e folha vêm do estado que as
  // abas dividem (a aba "Você" mostra este mesmo Explorar sob o menu).
  const state = useExploreState()
  const shotSource = useShotSource('explore', capture)
  const { device, district, liveOnly, filters } = state
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const center = searchCenter(device, city.data)
  const radiusKm = searchRadius(filters, session.data?.user.searchRadiusKm ?? 3)
  // "Ampliar" dobra o raio só nesta visita; o do perfil não muda.
  const wider = Math.min(radiusKm * 2, SEARCH_RADIUS_MAX_KM)

  const search = useQuery({
    ...trpc.pubs.search.queryOptions(searchInput(filters, center, radiusKm)),
    enabled: device !== null || !city.isPending,
    // Trocar um filtro mantém a lista e os pinos de antes até chegar a nova,
    // em vez de piscar "Buscando bares…".
    placeholderData: keepPreviousData
  })
  const now = Date.now()
  const found = search.data?.bars ?? []
  const liveCount = found.filter(
    (bar) => bar.nextEvent && isLive(bar.nextEvent, now)
  ).length
  const bars = liveOnly
    ? found.filter((bar) => bar.nextEvent && isLive(bar.nextEvent, now))
    : found
  // Com poucos bares com jogo, a lista se completa com bares perto sem jogo
  // marcado, para não terminar vazia (decisão do dono em 21/10/2026). Só no
  // fim da busca, fora do "Ao vivo" e sem "Só bares com jogo publicado".
  const few =
    !!search.data &&
    !search.data.nextCursor &&
    !liveOnly &&
    !filters.gamesOnly &&
    found.length < FEW_BARS
  const nearby = useQuery({
    ...trpc.pubs.nearbyWithoutGames.queryOptions({
      ...center,
      radiusKm,
      amenities: filters.amenities.length ? filters.amenities : undefined
    }),
    enabled: few,
    placeholderData: keepPreviousData
  })
  // As duas consultas vêm de momentos diferentes (cache, `keepPreviousData`):
  // um jogo que começa ou acaba entre elas punha o mesmo bar nas duas listas,
  // e a chave repetia. Quem já está na busca não entra como "sem jogo".
  const foundIds = new Set(found.map((bar) => bar.id))
  const quiet = few
    ? (nearby.data ?? []).filter((bar) => !foundIds.has(bar.id))
    : []
  const todayCount = bars.filter(
    // Jogo que começou ontem à noite e ainda rola também é "hoje".
    (bar) =>
      bar.nextEvent &&
      (isLive(bar.nextEvent, now) ||
        brasiliaDay(bar.nextEvent.startsAt) === today())
  ).length

  const favorites = useFavorites()
  // Atalhos do topo do mapa (19e): os da pessoa, ou os padrão com o esporte
  // principal dela.
  const sportList = useQuery(trpc.pubs.getSports.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const sports = sportList.data ?? []
  const shortcuts =
    state.shortcuts ?? defaultShortcuts(prefs.data?.[0]?.sport.slug ?? null)
  const active = activeCount(filters)

  const open = (bar: SearchBar) =>
    router.push({
      pathname: '/bar/[id]',
      // Nome e foto vão junto: a página desenha o topo antes da resposta.
      params: {
        id: bar.id,
        km: String(bar.distance_km),
        name: bar.name,
        photo: bar.photo_url ?? undefined,
        // Distância do aparelho, não do centro da cidade: vale "N min a pé".
        walk: device ? '1' : undefined
      }
    })

  // A folha: alta (lista inteira), no meio (como abre: só o título e um
  // card, para sobrar mapa, 20d) e baixa (só o título).
  const top = insets.top + 8
  const [selected, setSelected] = useState<string | null>(null)
  // No meio, a borda da folha fica a 296 pt do pé da tela (20a, 20b); com um
  // bar tocado, a 336 pt, para o card dele caber (20c).
  const snaps = [
    0,
    height - top - (selected ? 336 : 296),
    height - top - 150 - tabSpace
  ]
  const resting = state.resting ?? snaps[1]
  const { setResting } = state
  const expanded = resting === 0
  const reduced = useReducedMotion()

  // A faixa livre do mapa, entre os chips e a folha no meio. Fixa: mudar o
  // enquadramento a cada ponto da folha recentrava o mapa por cima da mola.
  const padding = {
    top: insets.top + 154,
    right: 0,
    left: 0,
    bottom: height - (top + snaps[1])
  }
  // A câmera abre no raio da pessoa (20d, regra 01): o círculo do raio na
  // faixa livre entre os chips e a folha. Nunca a cidade inteira. Abre no
  // zoom de bairro (20a); tocar num grupo leva ao de rua (20b). A região é
  // da tela toda, com o centro deslocado para o círculo cair na faixa:
  // `mapPadding` e `edgePadding` no iOS abriam três vezes mais longe.
  const band = height - padding.top - padding.bottom
  const metersPerPoint = Math.max(
    (radiusKm * 2000) / band,
    (radiusKm * 2000) / width
  )
  const shift = height / 2 - (padding.top + band / 2)
  const cosLat = Math.cos((center.lat * Math.PI) / 180)
  const region = {
    latitude: center.lat - (shift * metersPerPoint) / 111_000,
    longitude: center.lng,
    latitudeDelta: (height * metersPerPoint) / 111_000,
    longitudeDelta: (width * metersPerPoint) / (111_320 * cosLat)
  }
  const map = useRef<MapView>(null)
  const frameRadius = () =>
    map.current?.animateToRegion(region, reduced ? 0 : 400)
  // A região à vista decide grupos, pontos e rótulos (Rodada 20).
  const [view, setView] = useState<Region>(region)
  const [indexOf] = useState(indexCache)
  // Os sem jogo entram no mapa como ponto oco, fora dos grupos e dos rótulos.
  const listed = [...bars, ...quiet]
  const chosen = listed.find((bar) => bar.id === selected) ?? null
  const toMapBar = (bar: SearchBar): MapBar => {
    const game = bar.nextEvent
    const live = game ? isLive(game, now) : false
    return {
      id: bar.id,
      name: bar.name,
      lat: Number(bar.latitude),
      lng: Number(bar.longitude),
      live,
      elite: bar.plan === 'elite',
      distanceKm: bar.distance_km,
      next: game ? Date.parse(game.startsAt) : Number.POSITIVE_INFINITY,
      // A pílula do ao vivo leva o nome (21a).
      label: bar.name
    }
  }
  const mapBars = bars.map(toMapBar)
  const quietBars = quiet.map(toMapBar)
  // O índice dos grupos sem o bar tocado: ele nunca entra em grupo.
  const index = indexOf(mapBars.filter((b) => b.id !== selected))
  const chosenBar =
    [...mapBars, ...quietBars].find((b) => b.id === selected) ?? null
  const layers = mapLayers(
    index,
    chosenBar,
    view,
    { width, height },
    insets.top + 194,
    top + snaps[1]
  )
  // O que vai na gota: a pílula do ao vivo, ou o balão do bar tocado.
  const dropProps = (
    layer: Exclude<Layer, { kind: 'group' }>
  ): {
    live: boolean
    label?: string
    callout?: { name: string; when: string | null }
  } => {
    if (layer.kind === 'label') return { live: true, label: layer.bar.name }
    if (layer.kind !== 'selected') return { live: layer.bar.live }
    const game = bars.find((b) => b.id === layer.id)?.nextEvent
    // "HOJE 21:30", "AMANHÃ 21:30", "SÁB 21:30" ou "AO VIVO" (21a).
    const day = game
      ? dayLabel(game.startsAt, now)
          .split(',')[0]
          ?.replace('.', '')
          .toLocaleUpperCase('pt-BR')
      : null
    return {
      live: layer.bar.live,
      callout: {
        name: layer.bar.name,
        when: !game
          ? null
          : layer.bar.live
            ? 'AO VIVO'
            : `${day} ${formatTime(game.startsAt)}`
      }
    }
  }
  const tapLayer = (layer: Layer) => {
    haptic.select()
    if (layer.kind === 'group') {
      // Aproxima com o grupo na faixa livre, não no meio da tela (atrás da
      // folha), com o mesmo deslocamento da câmera de abertura.
      const next = expandGroup(index, layer, view, width)
      return map.current?.animateToRegion(
        {
          ...next,
          latitude: next.latitude - (shift * next.latitudeDelta) / height
        },
        reduced ? 0 : 350
      )
    }
    const bar = listed.find((b) => b.id === layer.id)
    if (!bar) return
    if (layer.kind === 'selected') return open(bar)
    setSelected(bar.id)
    // A folha sobe 40 pt com o card (20c): bar perto da borda dela, ou do
    // cabeçalho, ficaria coberto. A câmera desliza só o bastante para ele
    // cair no meio da faixa livre, junto com a folha.
    const y =
      ((view.latitude + view.latitudeDelta / 2 - Number(bar.latitude)) /
        view.latitudeDelta) *
      height
    // Abaixo dos chips sobra lugar para a gota grande e o balão (105 pt).
    const ceiling = insets.top + 218 + 105
    const floor = height - 336 - 24
    if (y < ceiling || y > floor) {
      const target = (ceiling + floor) / 2
      map.current?.animateToRegion(
        {
          ...view,
          latitude: view.latitude - ((y - target) / height) * view.latitudeDelta
        },
        reduced ? 0 : 300
      )
    }
  }
  // O mapa só aceita `animateToRegion` depois de pronto: a localização que
  // chegava antes disso se perdia, e o Explorar ficava na cidade do perfil.
  const [mapReady, setMapReady] = useState(false)
  // Enquadra quando o mapa fica pronto, quando o centro muda e quando chega a
  // primeira resposta; não a cada filtro, que desfaria o arrasto que a
  // pessoa fez no mapa.
  const framed = search.data !== undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: só centro, mapa pronto e primeira resposta
  useEffect(() => {
    if (mapReady) frameRadius()
  }, [mapReady, center.lat, center.lng, framed])
  // "Ver no mapa" da busca (19b): leva o mapa até o bairro escolhido.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando o foco muda
  useEffect(() => {
    const { focus } = state
    if (!mapReady || !focus) return
    map.current?.animateToRegion(
      {
        latitude: focus.lat,
        longitude: focus.lng,
        latitudeDelta: focus.km / 111,
        longitudeDelta: focus.km / 111
      },
      reduced ? 0 : 500
    )
    state.setFocus(null)
  }, [mapReady, state.focus])
  // "Ampliar" reenquadra quando os bares do raio novo chegam, não no toque:
  // antes disso a região sairia dos bares antigos.
  const framedRadius = useRef(radiusKm)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a resposta do raio novo chega
  useEffect(() => {
    if (!mapReady || search.isPlaceholderData) return
    if (framedRadius.current === radiusKm) return
    framedRadius.current = radiusKm
    frameRadius()
  }, [mapReady, search.data, radiusKm])

  // Enquanto a busca nova não chega, a lista de antes fica esmaecida: diz que
  // vai mudar sem piscar "Buscando bares…".
  const stale = search.isPlaceholderData
  const fresh = useSharedValue(1)
  useEffect(() => {
    fresh.set(withTiming(stale ? 0.5 : 1, { duration: 150, easing: EASE }))
  }, [stale, fresh])
  const listFade = useAnimatedStyle(() => ({ opacity: fresh.get() }))

  const y = useSharedValue(resting)
  // A outra aba pode ter movido a folha: esta acompanha ao voltar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a folha assenta
  useEffect(() => {
    if (Math.abs(y.get() - resting) > 1) y.set(resting)
  }, [resting])
  const start = useSharedValue(0)
  const scrollY = useSharedValue(0)
  // A barra de abas do iOS 26 apaga o que passa por baixo dela (scroll edge
  // effect) com a posição que a lista tinha no último layout. A folha anda por
  // transform, que não refaz layout: aberta do zero e puxada para cima, a
  // lista ficava apagada onde a barra estava com a folha no meio. Cada parada
  // mexe 1 pt na lista, fora da tela, para a barra recalcular.
  const [rests, setRests] = useState(0)
  const rested = (to: number) => {
    setResting(to)
    setRests((count) => count + 1)
  }
  /** A mola da folha; quando assenta, a tela fica sabendo onde parou. */
  const settle = (to: number, velocity = 0) => {
    'worklet'
    y.set(
      withSpring(
        to,
        { duration: 300, dampingRatio: 0.8, velocity, overshootClamping: true },
        (done) => {
          if (done) scheduleOnRN(rested, to)
        }
      )
    )
  }
  const nearest = (value: number) => {
    'worklet'
    let target = snaps[0]
    for (const snap of snaps)
      if (Math.abs(snap - value) < Math.abs(target - value)) target = snap
    return target
  }
  // Elástico da Apple: quanto mais passa da ponta, mais resiste.
  const rubber = (over: number) => {
    'worklet'
    return (over * height * 0.55) / (height + 0.55 * Math.abs(over))
  }
  const follow = (translationY: number) => {
    'worklet'
    const next = start.get() + translationY
    y.set(
      next < 0
        ? -rubber(-next)
        : next > snaps[2]
          ? snaps[2] + rubber(next - snaps[2])
          : next
    )
  }
  const release = (velocityY: number) => {
    'worklet'
    // Um peteleco basta: a velocidade escolhe o lado antes da distância.
    settle(nearest(y.get() + velocityY * 0.15), velocityY)
  }
  // O cabeçalho da folha arrasta sempre. Tocar sem arrastar a reassenta.
  const pan = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(y)
      start.set(y.get())
    })
    .onUpdate((event) => follow(event.translationY))
    .onEnd((event) => release(event.velocityY))
    .onFinalize((_, success) => {
      if (!success) settle(nearest(y.get()))
    })
  // A lista: com a folha aberta, rola; puxada para baixo no topo, desce a
  // folha. No meio, arrastá-la move a folha (a rolagem só vale aberta).
  const scroll = Gesture.Native()
  const dragging = useSharedValue(false)
  const listPan = Gesture.Pan()
    .simultaneousWithExternalGesture(scroll)
    .onBegin(() => {
      cancelAnimation(y)
      start.set(y.get())
      dragging.set(false)
    })
    .onUpdate((event) => {
      const open = start.get() <= 0
      if (!open || (scrollY.get() <= 0 && event.translationY > 0)) {
        dragging.set(true)
        follow(event.translationY)
      }
    })
    .onEnd((event) => {
      if (dragging.get()) release(event.velocityY)
    })
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y)
  })
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }]
  }))
  // No meio, o segundo card aparece e some num degradê antes da barra de
  // abas: diz que a lista continua. O degradê se desfaz quando a folha sobe.
  const veil = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.get(),
      [snaps[1] - 120, snaps[1] - 8],
      [0, 1],
      Extrapolation.CLAMP
    )
  }))
  // Tocar num bar sobe a folha um pouco, para o card dele caber (20c);
  // soltar volta (20a, 20b). Aberta como lista, fica onde está.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a escolha muda
  useEffect(() => {
    if (!expanded) settle(snaps[1])
  }, [selected])
  // A seta de "Lista" vira com a folha, não depois dela.
  const arrow = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(y.get(), [0, snaps[1]], [180, 0], Extrapolation.CLAMP)}deg`
      }
    ]
  }))

  const user = session.data?.user
  const firstName = user?.name.split(' ')[0] ?? ''
  const initials = initialsOf(user?.name ?? '')
  const place = district ?? city.data?.name ?? 'São Paulo'

  const title = chosen
    ? chosen.name
    : todayCount > 0
      ? `${todayCount} ${todayCount === 1 ? 'bar' : 'bares'} com jogo hoje`
      : bars.length > 0
        ? `${bars.length} ${bars.length === 1 ? 'bar' : 'bares'} com jogo`
        : quiet.length > 0
          ? 'Bares perto de você'
          : 'Bares com jogo'
  const glassTone = palette.dark ? 'dark' : 'light'
  const fade = palette.dark ? '18,18,15' : '241,238,230'

  return (
    <View
      ref={shotSource.ref}
      collapsable={false}
      style={{ flex: 1, backgroundColor: palette.bg }}
    >
      <MapView
        ref={map}
        onMapReady={() => setMapReady(true)}
        // A região que o mapa informa vem com o `mapPadding` misturado; os
        // cantos de verdade da tela vêm de `getMapBoundaries`.
        onRegionChangeComplete={() => {
          map.current
            ?.getMapBoundaries()
            .then(({ northEast: ne, southWest: sw }) =>
              setView({
                latitude: (ne.latitude + sw.latitude) / 2,
                longitude: (ne.longitude + sw.longitude) / 2,
                latitudeDelta: ne.latitude - sw.latitude,
                longitudeDelta: ne.longitude - sw.longitude
              })
            )
            .catch(() => {})
        }}
        // Tocar no mapa fora de um marcador solta o bar escolhido.
        onPress={(e) => {
          if (e.nativeEvent.action === 'marker-press' || !selected) return
          setSelected(null)
        }}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={palette.dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsTraffic={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {/* O raio de busca em volta de onde a busca parte (você, ou a
            cidade do perfil). */}
        <RadiusCircle
          center={{ latitude: center.lat, longitude: center.lng }}
          km={radiusKm}
          dark={palette.dark}
        />
        {device ? (
          <Marker
            coordinate={{ latitude: device.lat, longitude: device.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            // Um marcador só e parado: acompanhar a vista garante que o ponto
            // apareça mesmo quando chega depois do mapa.
            tracksViewChanges
            // Por baixo dos bares, como no design.
            zIndex={0}
            // O halo é largo (74 pt): tocar nele passa para o mapa, que solta
            // o bar tocado, em vez de engolir o toque.
            onPress={() => setSelected(null)}
          >
            <MeDot />
          </Marker>
        ) : null}
        {hoodNames(
          bars.map((bar) => ({
            neighborhood: bar.neighborhood,
            lat: Number(bar.latitude),
            lng: Number(bar.longitude)
          })),
          layers,
          view,
          { width, height },
          insets.top + 194
        ).map((hood) => (
          <MapMarker
            key={`hood:${hood.name}`}
            draw={`${palette.dark}`}
            coordinate={{ latitude: hood.lat, longitude: hood.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            zIndex={0}
          >
            <Text
              style={[
                styles.hoodName,
                {
                  color: palette.dark
                    ? 'rgba(241,238,230,.5)'
                    : 'rgba(18,18,15,.55)'
                }
              ]}
            >
              {hood.name}
            </Text>
          </MapMarker>
        ))}
        {quietBars
          .filter((bar) => bar.id !== selected)
          .map((bar) => (
            <MapMarker
              key={`quiet:${bar.id}`}
              draw={String(palette.dark)}
              coordinate={{ latitude: bar.lat, longitude: bar.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={0}
              onPress={() => tapLayer({ kind: 'point', id: bar.id, bar })}
            >
              <QuietDot dark={palette.dark} />
            </MapMarker>
          ))}
        {layers.map((layer) =>
          layer.kind === 'group' ? (
            <MapMarker
              key={layer.id}
              draw={`${layer.count}:${layer.live}`}
              coordinate={{ latitude: layer.lat, longitude: layer.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2}
              onPress={() => tapLayer(layer)}
            >
              <MapGroup
                count={layer.count}
                live={layer.live}
                dark={palette.dark}
              />
            </MapMarker>
          ) : (
            <MapMarker
              // Mudou o tipo (gota, gota com pílula, tocado), nasce outro
              // marcador: no Apple Maps, mudar o tamanho e o `centerOffset` de
              // um marcador vivo o deixava fora do lugar, e o `zIndex` só vale
              // na criação (o tocado precisa ficar por cima de tudo).
              key={`${layer.kind}:${layer.id}`}
              // Mudou o desenho (gota virou rótulo, o tema): redesenha.
              draw={`${layer.kind}:${layer.bar.live}:${layer.bar.elite}:${palette.dark}`}
              coordinate={{ latitude: layer.bar.lat, longitude: layer.bar.lng }}
              anchor={dropBox(dropProps(layer)).anchor}
              centerOffset={dropBox(dropProps(layer)).centerOffset}
              zIndex={
                layer.kind === 'selected' ? 3 : layer.kind === 'label' ? 2 : 1
              }
              onPress={() => tapLayer(layer)}
            >
              <MapDrop
                elite={layer.bar.elite}
                dark={palette.dark}
                {...dropProps(layer)}
              />
            </MapMarker>
          )
        )}
      </MapView>

      {/* O papel cobre o topo e se desfaz até o mapa, como no design: opaco
          até 150, 60% em 230, nada em 330. */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          `rgba(${fade},1)`,
          `rgba(${fade},.96)`,
          `rgba(${fade},.6)`,
          `rgba(${fade},0)`
        ]}
        locations={[0, 0.4545, 0.697, 1]}
        style={[styles.fade, { height: insets.top + 241 }]}
      />

      <View style={[styles.head, { top: insets.top + 13 }]}>
        <View style={styles.topRow}>
          <View style={styles.who}>
            <View
              style={[
                styles.avatar,
                { shadowColor: palette.dark ? 'rgba(201,241,53,.35)' : ACID }
              ]}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text
                style={[text(15, 'SemiBold', 1.3), { color: palette.ink }]}
                numberOfLines={1}
              >
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </Text>
              <View style={styles.place}>
                <Icon name="pin" size={13} color={palette.dark ? ACID : LIVE} />
                <Text
                  style={[
                    text(12.5, 'Regular', 1.3),
                    { color: palette.muted, flexShrink: 1 }
                  ]}
                  numberOfLines={1}
                >
                  {place}
                </Text>
                {/* Sem as setas do design (⇅): escolher outro lugar de busca
                    ainda não existe. */}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buscar"
              onPress={() => router.push('/busca')}
            >
              <Glass tone={glassTone} interactive style={styles.round}>
                <Icon name="search" size={19} color={palette.ink} />
              </Glass>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avisos"
              onPress={() => router.push('/avisos')}
            >
              <Glass tone={glassTone} interactive style={styles.round}>
                <Icon
                  name="bell"
                  size={19}
                  color={palette.ink}
                  accent={palette.dark ? ACID : LIVE}
                />
              </Glass>
            </Pressable>
          </View>
        </View>
        <Text
          style={[styles.title, { color: palette.ink }]}
          maxFontSizeMultiplier={1.2}
        >
          ONDE VAI SER <Text style={{ color: palette.live }}>O JOGO?</Text>
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chips, { top: insets.top + 117 }]}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {/* Todos os filtros (19d), com quantos estão ligados. */}
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel={active ? `Filtros, ${active} ligados` : 'Filtros'}
          onPress={() => {
            haptic.select()
            router.push('/filtros')
          }}
          // No escuro o acid assume o destaque, como no design (19i).
          style={[
            styles.filterButton,
            palette.dark && { backgroundColor: ACID }
          ]}
        >
          <Icon
            name="sliders"
            size={19}
            color={palette.dark ? INK : PAPER}
            accent={palette.dark ? INK : ACID}
          />
          {active ? (
            <Animated.View
              entering={POP_FAST}
              style={[
                styles.filterBadge,
                palette.dark && { backgroundColor: INK, borderColor: ACID }
              ]}
            >
              <Text
                style={[
                  text(10.5, 'Bold', 1.1),
                  { color: palette.dark ? ACID : INK }
                ]}
              >
                {active}
              </Text>
            </Animated.View>
          ) : null}
        </ScalePress>
        {/* "Ao vivo" é fixo, e só aparece com jogo rolando (19e). */}
        {liveCount || liveOnly ? (
          // Sem fade de entrada: vidro com transparência animada some no iOS.
          <Chip
            live
            label={liveCount ? `Ao vivo · ${liveCount}` : 'Ao vivo'}
            on={liveOnly}
            onPress={() => state.setLiveOnly(!liveOnly)}
          />
        ) : null}
        {shortcuts.map((key) => {
          const shown = shortcutLabel(key, sports)
          if (!shown) return null
          return (
            <Chip
              key={key}
              icon={shown.icon}
              label={shown.label}
              on={shortcutOn(key, filters, sports, now)}
              onPress={() =>
                state.setFilters(applyShortcut(key, filters, sports, now))
              }
            />
          )
        })}
      </ScrollView>

      <Animated.View
        style={[
          styles.sheet,
          { top, backgroundColor: palette.sheet },
          palette.dark && styles.sheetDark,
          sheet
        ]}
      >
        {/* Volta para o seu raio (20a): fica acima da folha e anda com ela. */}
        {expanded ? null : (
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Voltar para perto de você"
            containerStyle={styles.recenter}
            onPress={() => {
              setSelected(null)
              frameRadius()
            }}
          >
            <Glass
              tone={glassTone}
              interactive
              style={[styles.round, styles.round44]}
            >
              <Icon
                name="pin"
                size={18}
                color={palette.ink}
                accent={palette.dark ? ACID : LIVE}
              />
            </Glass>
          </ScalePress>
        )}
        <GestureDetector gesture={pan}>
          <View>
            <View
              style={[styles.grabber, { backgroundColor: palette.grabber }]}
            />
            <View style={styles.sheetHead}>
              <Text
                style={[styles.sheetTitle, { color: palette.ink }]}
                numberOfLines={1}
              >
                {title.toUpperCase()}
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  // Com um bar tocado, "Lista" volta para todos.
                  if (chosen) setSelected(null)
                  settle(expanded ? snaps[1] : 0)
                }}
                style={styles.listButton}
              >
                <Text style={[text(13, 'Bold', 1.2), { color: palette.ink }]}>
                  {expanded ? 'Mapa' : 'Lista'}
                </Text>
                <Animated.View style={arrow}>
                  <Icon name="arrowUp" size={14} color={palette.ink} />
                </Animated.View>
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <GestureDetector gesture={listPan}>
          <GestureDetector gesture={scroll}>
            <Animated.ScrollView
              style={{ marginBottom: rests % 2 }}
              onScroll={onScroll}
              scrollEventThrottle={16}
              scrollEnabled={expanded}
              bounces={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 2,
                // A barra fica por cima e, no meio, a folha passa da tela: o
                // último card precisa subir acima das duas.
                paddingBottom: tabSpace + 24 + top + resting,
                gap: 12
              }}
              showsVerticalScrollIndicator={false}
            >
              {search.isError ? (
                <View style={styles.note}>
                  <Text style={[text(14), { color: palette.muted }]}>
                    Não deu para buscar os bares.
                  </Text>
                  <Pressable onPress={() => search.refetch()} hitSlop={10}>
                    <Text
                      style={[
                        text(14, 'Bold'),
                        styles.link,
                        { color: palette.ink }
                      ]}
                    >
                      Tentar de novo
                    </Text>
                  </Pressable>
                </View>
              ) : !search.data ? (
                <Text style={[text(14), styles.note, { color: palette.muted }]}>
                  Buscando bares…
                </Text>
              ) : bars.length === 0 && quiet.length === 0 ? (
                <Text style={[text(14), styles.note, { color: palette.muted }]}>
                  {liveOnly
                    ? 'Nenhum jogo ao vivo agora por perto.'
                    : `Nenhum bar com jogo num raio de ${radiusKm} km.`}
                </Text>
              ) : (
                <Animated.View style={[{ gap: 12 }, listFade]}>
                  {/* Bar tocado no mapa (20c): a folha troca para o card dele. */}
                  {chosen ? (
                    // Sem fade: o card tem vidro, e vidro com transparência animada some.
                    <BarTicket
                      key={chosen.id}
                      bar={chosen}
                      now={now}
                      favorite={favorites.ids.has(chosen.id)}
                      onFavorite={() => favorites.toggle(chosen.id)}
                      onPress={() => open(chosen)}
                    />
                  ) : (
                    // Fora da lista aberta, os cards vão sem a hora (20a). Os
                    // sem jogo vêm depois, com um título.
                    [...bars, ...quiet].map((bar, index) => (
                      <View key={bar.id} style={{ gap: 12 }}>
                        {index === bars.length ? (
                          <QuietHead
                            alone={bars.length === 0}
                            radiusKm={radiusKm}
                          />
                        ) : null}
                        <BarRow
                          bar={bar}
                          now={now}
                          compact={!expanded}
                          onPress={() => open(bar)}
                        />
                      </View>
                    ))
                  )}
                </Animated.View>
              )}
              {stale ? (
                <Text
                  style={[
                    text(13.5, 'Regular', 1.3),
                    styles.end,
                    { color: palette.muted }
                  ]}
                >
                  Buscando no raio de {radiusKm} km…
                </Text>
              ) : search.data &&
                bars.length + quiet.length > 0 &&
                !search.data.nextCursor ? (
                // Só no fim de verdade: com página seguinte, ampliar traria os
                // mesmos bares mais perto.
                <View style={styles.endRow}>
                  <Text
                    style={[
                      text(13.5, 'Regular', 1.3),
                      { color: palette.muted }
                    ]}
                  >
                    Fim da lista no raio de {radiusKm} km
                    {wider > radiusKm ? ' · ' : ''}
                  </Text>
                  {wider > radiusKm ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Ampliar para ${wider} km`}
                      hitSlop={12}
                      onPress={() => {
                        haptic.select()
                        state.setFilters({ ...filters, radius: wider })
                      }}
                    >
                      <Text
                        style={[
                          text(13.5, 'Bold', 1.3),
                          { color: palette.ink }
                        ]}
                      >
                        Ampliar
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Animated.ScrollView>
          </GestureDetector>
        </GestureDetector>
        {/* Só com mais de um card: sozinho, o degradê cobriria o fim da lista. */}
        {!chosen && bars.length + quiet.length > 1 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.veil,
              {
                top: height - top - snaps[1] - tabSpace - VEIL_ABOVE_TABS
              },
              veil
            ]}
          >
            <LinearGradient
              colors={[
                palette.dark ? 'rgba(22,22,19,0)' : 'rgba(241,238,230,0)',
                palette.sheet
              ]}
              style={{ height: VEIL_HEIGHT }}
            />
            <View style={{ flex: 1, backgroundColor: palette.sheet }} />
          </Animated.View>
        ) : null}
      </Animated.View>

      {soon.toast}
    </View>
  )
}

/** O degradê da folha no meio: começa tantos pt acima da barra de abas… */
const VEIL_ABOVE_TABS = 16
/** …e chega à cor da folha nesta altura, já por baixo do vidro da barra. */
const VEIL_HEIGHT = 64

/** Abaixo disso, a lista do Explorar se completa com bares sem jogo. */
const FEW_BARS = 5

/** O título dos bares sem jogo no fim da lista. */
function QuietHead({
  alone,
  radiusKm
}: {
  /** Nenhum bar com jogo: o título diz isso antes. */
  alone: boolean
  radiusKm: number
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 2, paddingTop: alone ? 0 : 8 }}>
      <Text style={[text(13, 'Bold', 1.3), { color: palette.ink }]}>
        {alone
          ? `Nenhum bar com jogo num raio de ${radiusKm} km`
          : 'Sem jogo marcado'}
      </Text>
      <Text style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}>
        {alone
          ? 'Mas estes bares ficam perto de você.'
          : 'Bares perto de você que ainda não publicaram jogo.'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', top: -58, right: 14 },
  round44: { width: 44, height: 44, borderRadius: 22 },
  hoodName: {
    fontFamily: 'Anton',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: ACID,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  head: { position: 'absolute', left: 16, right: 16, gap: 12 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  // Encolhe com nome longo em vez de empurrar a busca e o sino para fora.
  who: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center'
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  avatarText: {
    fontFamily: 'Anton',
    fontSize: 17,
    color: ACID,
    marginVertical: -5
  },
  place: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    letterSpacing: -0.8,
    marginVertical: -10
  },
  chips: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12
  },
  veil: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetDark: {
    shadowOpacity: 0.7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.06)'
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8
  },
  sheetHead: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12
  },
  sheetTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    letterSpacing: -0.5,
    flexShrink: 1,
    marginVertical: -6
  },
  listButton: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingBottom: 3
  },
  note: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
    textAlign: 'center'
  },
  link: { textDecorationLine: 'underline' },
  end: { textAlign: 'center', paddingVertical: 8 },
  endRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingVertical: 8
  }
})

/**
 * Marcador que redesenha quando muda (`draw`). Com `tracksViewChanges`
 * desligado o iOS guarda uma foto do desenho: tirada cedo demais, o
 * marcador novo aparecia em branco até o mapa mexer, e um rótulo que mudava
 * de texto ficava com o antigo. Fica acompanhando só um instante depois de
 * nascer ou mudar.
 */
function MapMarker({
  draw,
  ...props
}: React.ComponentProps<typeof Marker> & { draw: string }) {
  const [tracking, setTracking] = useState(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: redesenha quando `draw` muda
  useEffect(() => {
    setTracking(true)
    const stop = setTimeout(() => setTracking(false), 500)
    return () => clearTimeout(stop)
  }, [draw])
  return <Marker {...props} tracksViewChanges={tracking} />
}
