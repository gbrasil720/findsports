import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import MapView, { Marker } from 'react-native-maps'
import Animated, {
  cancelAnimation,
  type EntryExitAnimationFunction,
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
  HardShadow,
  initials as initialsOf,
  MapDrop,
  MapGroup,
  MeDot,
  Photo,
  PhotoPill,
  QuietDot,
  RadiusCircle,
  type SearchBar
} from '@/components/explore'
import { useExploreState, useShotSource } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { useLayout, useNavInsets } from '@/components/layout'
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
  PillButton,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { answerPins } from '@/lib/ai-chat'
import type { ChatBar } from '@/lib/ai-events'
import { authClient } from '@/lib/auth-client'
import {
  coverBars,
  coverKicker,
  formatKm,
  formatTime,
  greeting,
  isLive,
  searchCenter
} from '@/lib/explore'
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
  frameRegion,
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
/**
 * Saudação e lugar cabem nos 40 pt do avatar até 1,1×: o cabeçalho tem medida
 * fixa sobre o mapa (atalhos, folha e câmera contam a partir dele), e acima
 * disso a segunda linha empurraria o título para cima dos atalhos.
 */
const HEAD_FONT_SCALE = 1.1

export default function Explore({ capture = true }: { capture?: boolean }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const palette = usePalette()
  const session = authClient.useSession()
  const soon = useSoon()
  const tabSpace = useTabBarSpace()
  const layout = useLayout()
  const navInsets = useNavInsets()
  // Celular (e Duo fechado): o mapa na tela toda e a lista numa folha. No
  // tablet e no dobrável aberto (T1 do design adaptativo), a lista à esquerda
  // e o mapa ao lado (`split`), ou o mapa num card sobre a lista (`stack`).
  const phone = layout.kind === 'phone' || layout.kind === 'duoClosed'
  const stack = layout.kind === 'stack'
  // Meio dobrado na mesa (Duo em laptop, Flex Mode): o mapa em cima, a lista
  // embaixo da dobra. Tela de fora do Flip: só o bar mais perto (`Cover`).
  const table = layout.kind === 'table'
  const cover = layout.kind === 'cover'
  // O dobrável aberto tem a lista mais justa (12 dos lados, não 22).
  const pad = stack
    ? 24
    : Platform.OS === 'android' && layout.nav === 'float'
      ? 12
      : 22
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
  // "Vou assistir aqui" no próximo jogo do bar (o card ao lado no 13″, a
  // tela de fora do Flip).
  const go = (bar: SearchBar) =>
    router.push({
      pathname: '/vou/[barId]',
      params: { barId: bar.id, eventId: bar.nextEvent?.id }
    })
  // Bar da resposta da busca com IA que a busca daqui não tem: sem o card da
  // folha (ele é da busca), o toque na gota abre a página dele direto.
  const openAnswer = (bar: ChatBar) =>
    router.push({
      pathname: '/bar/[id]',
      params: {
        id: bar.id,
        km: bar.distanceKm === null ? undefined : String(bar.distanceKm),
        name: bar.name,
        photo: bar.photoUrl ?? undefined,
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

  // Onde o mapa fica: a tela toda no celular; ao lado da lista no `split`
  // (sob a navegação do Duo, à direita); num card abaixo dos chips no `stack`.
  // A câmera (abrir no raio, recentrar, abrir grupo) conta sobre esta área.
  const mapBox =
    phone || cover
      ? { left: 0, width, height }
      : table
        ? { left: 0, width, height: layout.split }
        : stack
          ? {
              left: navInsets.left + pad,
              width: width - navInsets.left - navInsets.right - 2 * pad,
              height: Math.round(height * (height >= TALL ? 0.38 : 0.34))
            }
          : {
              // Do outro lado da dobra, quando há uma (livro, Fold aberto).
              left: navInsets.left + layout.split + layout.gap,
              width: width - navInsets.left - layout.split - layout.gap,
              height
            }
  // A faixa livre do mapa: no celular, entre os chips e a folha no meio.
  // Fixa: mudar o enquadramento a cada ponto da folha recentrava o mapa por
  // cima da mola. No `split`, entre a barra de status e a barra flutuante.
  const padding =
    phone || cover
      ? { top: insets.top + 154, bottom: height - (top + snaps[1]) }
      : table
        ? // Os chips passam por cima do mapa, no topo.
          { top: insets.top + 64, bottom: 16 }
        : stack
          ? { top: 16, bottom: 16 }
          : {
              top: insets.top + 16,
              bottom:
                (layout.nav === 'float' ? navInsets.bottom : insets.bottom) + 16
            }
  // A câmera abre no raio da pessoa (20d, regra 01): o círculo do raio na
  // faixa livre entre os chips e a folha. Nunca a cidade inteira. Abre no
  // zoom de bairro (20a); tocar num grupo leva ao de rua (20b).
  const screen = {
    width: mapBox.width,
    height: mapBox.height,
    top: padding.top,
    bottom: padding.bottom
  }
  const band = mapBox.height - padding.top - padding.bottom
  const shift = mapBox.height / 2 - (padding.top + band / 2)
  const region = frameRegion(
    { ...center, kmTall: radiusKm * 2, kmWide: radiusKm * 2 },
    screen
  )
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
  // Os bares da resposta do "Ver no mapa" da busca com IA entram como gotas
  // até a pessoa mexer na busca ou voltar ao raio (`answer`).
  const mapBars = [
    ...bars.map(toMapBar),
    ...answerPins(state.answer ?? [], new Set(listed.map((bar) => bar.id)))
  ]
  const quietBars = quiet.map(toMapBar)
  // O índice dos grupos sem o bar tocado: ele nunca entra em grupo.
  const index = indexOf(mapBars.filter((b) => b.id !== selected))
  const chosenBar =
    [...mapBars, ...quietBars].find((b) => b.id === selected) ?? null
  const layers = mapLayers(
    index,
    chosenBar,
    view,
    mapBox,
    phone ? insets.top + 194 : padding.top,
    phone ? top + snaps[1] : mapBox.height - padding.bottom
  )
  // 13″ e Tab S11 Ultra deitados: o bar tocado vai num card ao lado da lista,
  // sobre o mapa (a01p, a01u), e a gota dele fica sem o balão.
  const detail = layout.wide && layout.kind === 'split' ? chosen : null
  // O que vai na gota: a pílula do ao vivo, ou o balão do bar tocado.
  const dropProps = (
    layer: Exclude<Layer, { kind: 'group' }>
  ): {
    live: boolean
    label?: string
    callout?: { name: string; when: string | null }
  } => {
    if (layer.kind === 'label') return { live: true, label: layer.bar.name }
    if (layer.kind !== 'selected' || detail) return { live: layer.bar.live }
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
      const next = expandGroup(index, layer, view, mapBox.width)
      return map.current?.animateToRegion(
        {
          ...next,
          latitude: next.latitude - (shift * next.latitudeDelta) / mapBox.height
        },
        reduced ? 0 : 350
      )
    }
    const bar = listed.find((b) => b.id === layer.id)
    if (!bar) {
      const answered = state.answer?.find((b) => b.id === layer.id)
      if (answered) openAnswer(answered)
      return
    }
    if (layer.kind === 'selected') return open(bar)
    setSelected(bar.id)
    // A folha sobe 40 pt com o card (20c): bar perto da borda dela, ou do
    // cabeçalho, ficaria coberto. A câmera desliza só o bastante para ele
    // cair no meio da faixa livre, junto com a folha.
    const y =
      ((view.latitude + view.latitudeDelta / 2 - Number(bar.latitude)) /
        view.latitudeDelta) *
      mapBox.height
    // Abaixo dos chips sobra lugar para a gota grande e o balão (105 pt).
    const ceiling = (phone ? insets.top + 218 : padding.top) + 105
    const floor = phone
      ? height - 336 - 24
      : mapBox.height - padding.bottom - 24
    if (y < ceiling || y > floor) {
      const target = (ceiling + floor) / 2
      map.current?.animateToRegion(
        {
          ...view,
          latitude:
            view.latitude - ((y - target) / mapBox.height) * view.latitudeDelta
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
  // "Ver no mapa" da busca (19b) e da busca com IA (WEB-432): o quadro
  // pedido na faixa livre, como o raio.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando o foco muda
  useEffect(() => {
    const { focus } = state
    if (!mapReady || !focus) return
    map.current?.animateToRegion(frameRegion(focus, screen), reduced ? 0 : 500)
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

  // A coluna da lista no tablet: o título, a linha compacta numa coluna
  // estreita e a largura de cada card nas duas colunas em pé.
  const titleSize = stack
    ? height >= TALL
      ? 52
      : width < 800
        ? 40
        : 44
    : layout.wide
      ? 44
      : 34
  const narrow = !stack && layout.split - 2 * pad < 350
  const column = (mapBox.width - 12) / 2
  // Em pé, o mapa fica no espaço que a coluna reserva para ele, medido.
  const [mapTop, setMapTop] = useState(0)

  // Os cards fora do celular: o primeiro com jogo em ingresso; numa coluna
  // estreita (iPad mini deitado, Fold aberto) e na mesa, todos na linha
  // compacta. Em pé e na mesa, em duas colunas (`columns` é a largura de uma).
  const compactRows = narrow || table
  const columns = stack ? column : table ? (width - 40 - 12) / 2 : 0
  const gridCards = listed.map((bar, index) => {
    // O primeiro com jogo vai em ingresso; numa coluna estreita
    // (iPad mini deitado, Fold aberto), todos na linha compacta.
    const ticket = index === 0 && bars.length > 0 && !compactRows
    return (
      <Fragment key={bar.id}>
        {index === bars.length ? (
          <View style={styles.full}>
            <QuietHead alone={bars.length === 0} radiusKm={radiusKm} />
          </View>
        ) : null}
        <View style={columns && !ticket ? { width: columns } : styles.full}>
          {ticket ? (
            <BarTicket
              bar={bar}
              now={now}
              favorite={favorites.ids.has(bar.id)}
              onFavorite={() => favorites.toggle(bar.id)}
              onPress={() => open(bar)}
            />
          ) : (
            <BarRow
              bar={bar}
              now={now}
              compact={compactRows}
              onPress={() => open(bar)}
            />
          )}
        </View>
      </Fragment>
    )
  })

  // O que o celular e o tablet dividem: a saudação com busca e avisos, os
  // chips de filtro e o miolo da lista (erro, vazio, cards, "Ampliar").
  const topRow = (
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
            maxFontSizeMultiplier={HEAD_FONT_SCALE}
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
              maxFontSizeMultiplier={HEAD_FONT_SCALE}
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
  )
  const chipItems = (
    <>
      {/* Todos os filtros (19d), com quantos estão ligados. */}
      <ScalePress
        accessibilityRole="button"
        accessibilityLabel={active ? `Filtros, ${active} ligados` : 'Filtros'}
        onPress={() => {
          haptic.select()
          router.push('/filtros')
        }}
        // No escuro o acid assume o destaque, como no design (19i).
        style={[styles.filterButton, palette.dark && { backgroundColor: ACID }]}
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
    </>
  )
  const listBody = (cards: ReactNode, grid?: object) => (
    <>
      {search.isError ? (
        <View style={styles.note}>
          <Text style={[text(14), { color: palette.muted }]}>
            Não deu para buscar os bares.
          </Text>
          <Pressable onPress={() => search.refetch()} hitSlop={10}>
            <Text
              style={[text(14, 'Bold'), styles.link, { color: palette.ink }]}
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
        <Animated.View style={[{ gap: 12 }, grid, listFade]}>
          {cards}
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
          <Text style={[text(13.5, 'Regular', 1.3), { color: palette.muted }]}>
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
              <Text style={[text(13.5, 'Bold', 1.3), { color: palette.ink }]}>
                Ampliar
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  )

  return (
    <View
      ref={shotSource.ref}
      collapsable={false}
      style={{ flex: 1, backgroundColor: palette.bg }}
    >
      {/* O mapa fica sempre neste lugar da árvore: girar o tablet ou abrir o
          dobrável só muda a caixa dele, sem remontar (a posição, os pinos e
          o bar tocado continuam onde estavam). */}
      <View
        pointerEvents="box-none"
        style={
          // Na tela de fora do Flip o mapa fica por baixo da foto do bar:
          // abrir o celular o mostra como estava.
          phone || cover
            ? StyleSheet.absoluteFill
            : table
              ? [styles.mapTop, { height: mapBox.height }]
              : stack
                ? [
                    styles.mapCard,
                    {
                      top: mapTop,
                      left: mapBox.left,
                      width: mapBox.width,
                      height: mapBox.height,
                      // Até o espaço dele na coluna ser medido.
                      opacity: mapTop ? 1 : 0
                    }
                  ]
                : [styles.mapSide, { left: mapBox.left }]
        }
      >
        {stack ? (
          <HardShadow color={palette.shadow} offset={4} radius={9} />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            stack && [styles.mapClip, { borderColor: palette.ring }]
          ]}
        >
          <MapView
            // No iPhone Duo, abrir ou fechar leva o app para a outra tela, e o
            // mapa da Apple fica em branco na tela nova. Recomeça nela, onde a
            // pessoa estava (`view`).
            key={layout.kind === 'duoClosed' ? 'fora' : 'dentro'}
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
            initialRegion={view}
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
              mapBox,
              phone ? insets.top + 194 : padding.top
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
                  coordinate={{
                    latitude: layer.bar.lat,
                    longitude: layer.bar.lng
                  }}
                  anchor={dropBox(dropProps(layer)).anchor}
                  centerOffset={dropBox(dropProps(layer)).centerOffset}
                  zIndex={
                    layer.kind === 'selected'
                      ? 3
                      : layer.kind === 'label'
                        ? 2
                        : 1
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
        </View>
        {phone || cover ? null : (
          // Recentrar e aproximar (a01): embaixo à direita, acima da barra
          // flutuante quando ela passa sobre o mapa; no Duo, embaixo à
          // esquerda, longe da faixa.
          <View
            style={[
              styles.mapControls,
              layout.nav === 'duoRail' ? { left: 16 } : { right: 16 },
              {
                bottom:
                  stack || table
                    ? 16
                    : layout.nav === 'float'
                      ? navInsets.bottom + 14
                      : insets.bottom + 20
              }
            ]}
          >
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Voltar para perto de você"
              onPress={() => {
                setSelected(null)
                state.clearAnswer()
                frameRadius()
              }}
            >
              <Glass
                tone={glassTone}
                interactive
                style={[styles.round, styles.round46]}
              >
                <Icon
                  name="pin"
                  size={18}
                  color={palette.ink}
                  accent={palette.dark ? ACID : LIVE}
                />
              </Glass>
            </ScalePress>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Aproximar"
              onPress={() =>
                map.current?.animateToRegion(
                  {
                    ...view,
                    latitudeDelta: view.latitudeDelta / 2,
                    longitudeDelta: view.longitudeDelta / 2
                  },
                  reduced ? 0 : 300
                )
              }
            >
              <Glass
                tone={glassTone}
                interactive
                style={[styles.round, styles.round46]}
              >
                <Icon name="plus" size={18} color={palette.ink} />
              </Glass>
            </ScalePress>
          </View>
        )}
        {detail ? (
          // O bar tocado ao lado (13″ e Tab S11 Ultra deitados): o card e o
          // "Vou assistir aqui", sem sair do mapa. Entra deslizando, sem
          // fade: o card tem vidro.
          <Animated.View
            key={detail.id}
            entering={reduced ? undefined : DETAIL_IN}
            style={[
              styles.detail,
              { top: insets.top + 6, right: navInsets.right + 20 }
            ]}
          >
            <BarTicket
              bar={detail}
              now={now}
              favorite={favorites.ids.has(detail.id)}
              onFavorite={() => favorites.toggle(detail.id)}
              onPress={() => open(detail)}
            />
            {detail.nextEvent ? (
              <PillButton
                label="Vou assistir aqui"
                leading="ticket"
                height={52}
                onPress={() => go(detail)}
              />
            ) : null}
          </Animated.View>
        ) : null}
      </View>

      {phone ? (
        <>
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

          <View
            style={[
              styles.head,
              { top: insets.top + 13, right: 16 + navInsets.right }
            ]}
          >
            {topRow}
            <Text
              style={[styles.title, { color: palette.ink }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              ONDE VAI SER <Text style={{ color: palette.live }}>O JOGO?</Text>
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.chips,
              { top: insets.top + 117, right: navInsets.right }
            ]}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {chipItems}
          </ScrollView>

          <Animated.View
            style={[
              styles.sheet,
              { top, right: navInsets.right, backgroundColor: palette.sheet },
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
                  state.clearAnswer()
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
                    <Text
                      style={[text(13, 'Bold', 1.2), { color: palette.ink }]}
                    >
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
                  {listBody(
                    // Bar tocado no mapa (20c): a folha troca para o card dele.
                    // Sem fade: o card tem vidro, e vidro com transparência animada some.
                    chosen ? (
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
                    )
                  )}
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
        </>
      ) : cover ? (
        <Cover
          bars={bars}
          now={now}
          searching={!search.data}
          onOpen={open}
          onGo={go}
        />
      ) : table ? (
        // Meio dobrado na mesa (a01d, a01g): os chips sobre o mapa, e a
        // lista em duas colunas na metade de baixo.
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chips, { top: insets.top + 12 }]}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {chipItems}
          </ScrollView>
          <View
            style={[
              styles.pane,
              styles.tablePane,
              {
                top: layout.split + layout.gap,
                backgroundColor: palette.bg
              }
            ]}
          >
            <View style={styles.section}>
              <Text
                style={[
                  styles.title,
                  { color: palette.ink, fontSize: 26, marginVertical: -6.5 }
                ]}
                numberOfLines={1}
              >
                ONDE VAI SER{' '}
                <Text style={{ color: palette.live }}>O JOGO?</Text>
              </Text>
              {listed.length ? (
                <Text
                  style={[text(13, 'Regular', 1.3), { color: palette.muted }]}
                >
                  {listed.length} {listed.length === 1 ? 'bar' : 'bares'}
                </Text>
              ) : null}
            </View>
            <ScrollView
              style={{ flex: 1, marginHorizontal: -20 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 2,
                paddingBottom: navInsets.bottom + 24,
                gap: 12
              }}
              showsVerticalScrollIndicator={false}
            >
              {listBody(gridCards, styles.grid)}
            </ScrollView>
          </View>
        </>
      ) : (
        // Tablet e dobrável aberto: a coluna da lista (à esquerda do mapa, ou
        // a tela toda em pé, com o espaço do mapa reservado abaixo dos chips).
        <View
          pointerEvents="box-none"
          style={[
            styles.pane,
            {
              left: navInsets.left,
              // 44 do topo, como no design, abaixo da barra de status.
              paddingTop: Math.max(44, insets.top + 12),
              paddingHorizontal: pad,
              gap: stack ? 16 : 14
            },
            stack ? { right: navInsets.right } : { width: layout.split }
          ]}
        >
          {topRow}
          <Text
            style={[
              styles.title,
              {
                color: palette.ink,
                fontSize: titleSize,
                marginVertical: -titleSize / 4
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            ONDE VAI SER <Text style={{ color: palette.live }}>O JOGO?</Text>
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -pad }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}
          >
            {chipItems}
          </ScrollView>
          {stack ? (
            <View
              pointerEvents="none"
              style={{ height: mapBox.height }}
              onLayout={(e) => setMapTop(e.nativeEvent.layout.y)}
            />
          ) : null}
          <View style={styles.section}>
            <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
              Agora e hoje
            </Text>
            {listed.length ? (
              <Text
                style={[text(13, 'Regular', 1.3), { color: palette.muted }]}
              >
                {listed.length} {listed.length === 1 ? 'bar' : 'bares'}
              </Text>
            ) : null}
          </View>
          <ScrollView
            style={{ flex: 1, marginHorizontal: -pad }}
            contentContainerStyle={{
              paddingHorizontal: pad,
              paddingTop: 2,
              // A barra flutuante passa sobre a lista em pé; deitado, sobre o mapa.
              paddingBottom: (stack ? navInsets.bottom : insets.bottom) + 24,
              gap: 12
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Em pé, duas colunas (a01k, a01m, a01o). */}
            {listBody(gridCards, stack ? styles.grid : undefined)}
          </ScrollView>
        </View>
      )}
      {soon.toast}
    </View>
  )
}

/** O degradê da folha no meio: começa tantos pt acima da barra de abas… */
const VEIL_ABOVE_TABS = 16
/** …e chega à cor da folha nesta altura, já por baixo do vidro da barra. */
const VEIL_HEIGHT = 64

/** Tablet em pé com mais altura que isto (13″, Tab S11 Ultra): mapa maior. */
const TALL = 1350

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

/**
 * A tela de fora do Z Flip 8 (a01j, regra 07): o bar com jogo mais perto em
 * tela cheia e o "Vou" à direita, longe das câmeras (embaixo à esquerda).
 * Desliza para o próximo, até cinco. O mapa fica por baixo, para abrir o
 * celular e encontrá-lo como estava.
 */
function Cover({
  bars,
  now,
  searching,
  onOpen,
  onGo
}: {
  bars: SearchBar[]
  now: number
  searching: boolean
  onOpen: (bar: SearchBar) => void
  onGo: (bar: SearchBar) => void
}) {
  const { width, height } = useWindowDimensions()
  const [page, setPage] = useState(0)
  const shown = coverBars(bars)
  const bar = shown[Math.min(page, shown.length - 1)]
  if (!bar?.nextEvent)
    return (
      <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
        <Text style={[text(14, 'Regular', 1.4), styles.coverEmptyText]}>
          {searching ? 'Buscando bares…' : 'Nenhum bar com jogo por perto.'}
        </Text>
      </View>
    )
  const live = isLive(bar.nextEvent, now)
  const where = `${live ? 'Ao vivo' : formatTime(bar.nextEvent.startsAt)} · ${formatKm(bar.distance_km)}`
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2a2a25' }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        {shown.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => onOpen(item)}
            style={{ width, height }}
          >
            <Photo
              uri={item.photo_url}
              name={item.name}
              style={StyleSheet.absoluteFill}
              big
            />
            <LinearGradient
              colors={[
                'rgba(18,18,15,.55)',
                'rgba(18,18,15,.15)',
                'rgba(18,18,15,.92)'
              ]}
              locations={[0, 0.35, 0.75]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coverText}>
              {item.nextEvent ? (
                <Text style={styles.coverKicker} numberOfLines={1}>
                  {coverKicker(item.nextEvent, now)}
                </Text>
              ) : null}
              <Text
                style={styles.coverName}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.name}
              </Text>
              <Text
                style={[text(13, 'Regular', 1.3), { color: '#d6d3cb' }]}
                numberOfLines={1}
              >
                {item.neighborhood}
                {item.goingCount ? ` · ${item.goingCount} vão` : ''}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.coverTop}>
        <PhotoPill kind={live ? 'live' : 'dark'} height={26}>
          {live ? <View style={styles.coverDot} /> : null}
          <Text style={[text(11.5, 'Bold', 1.2), { color: PAPER }]}>
            {where}
          </Text>
        </PhotoPill>
        {shown.length > 1 ? (
          <View style={styles.coverDots}>
            {shown.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.coverPage,
                  item.id === bar.id && styles.coverPageOn
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      {shown.length > 1 ? (
        <Text
          pointerEvents="none"
          style={[text(11, 'Regular', 1.35), styles.coverHint]}
        >
          Deslize para o próximo bar
        </Text>
      ) : null}
      <ScalePress
        accessibilityRole="button"
        accessibilityLabel={`Vou assistir no ${bar.name}`}
        containerStyle={styles.coverGoSpot}
        onPress={() => {
          haptic.select()
          onGo(bar)
        }}
      >
        <View style={styles.coverGo}>
          <Icon name="ticket" size={24} color={INK} accent={INK} />
          <Text style={[text(12.5, 'Bold', 1.2), { color: INK }]}>Vou</Text>
        </View>
      </ScalePress>
    </View>
  )
}

/**
 * O card do bar tocado ao lado entra deslizando 24 pt da direita, numa mola
 * sem passo além. Sem fade: o card tem vidro, que some com opacidade animada.
 */
const DETAIL_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateX: 24 }] },
    animations: {
      transform: [
        { translateX: withSpring(0, { duration: 300, dampingRatio: 1 }) }
      ]
    }
  }
}

const styles = StyleSheet.create({
  pane: { position: 'absolute', top: 0, bottom: 0 },
  coverEmpty: {
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  coverEmptyText: { color: PAPER, textAlign: 'center' },
  coverText: { position: 'absolute', left: 22, right: 22, bottom: 118, gap: 4 },
  coverKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    color: ACID
  },
  coverName: {
    fontFamily: 'Anton',
    fontSize: 40,
    color: PAPER,
    textTransform: 'uppercase',
    marginTop: 2,
    marginVertical: -10
  },
  coverTop: {
    position: 'absolute',
    top: 26,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  coverDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PAPER },
  coverDots: { flexDirection: 'row', gap: 5 },
  coverPage: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(241,238,230,.35)'
  },
  coverPageOn: { width: 16, backgroundColor: ACID },
  coverHint: {
    position: 'absolute',
    left: 150,
    right: 118,
    bottom: 40,
    color: 'rgba(241,238,230,.6)'
  },
  coverGoSpot: { position: 'absolute', right: 20, bottom: 22 },
  coverGo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 6
  },
  tablePane: {
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    gap: 12
  },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  full: { width: '100%' },
  mapSide: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  mapCard: { position: 'absolute' },
  mapTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  mapClip: { borderRadius: 9, overflow: 'hidden', borderWidth: 1 },
  mapControls: { position: 'absolute', gap: 10 },
  round46: { width: 46, height: 46, borderRadius: 23 },
  detail: { position: 'absolute', width: 360, gap: 12 },
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
