import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  BackHandler,
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
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { BarDetail } from '@/app/bar/[id]'
import {
  dayLabel,
  dropBox,
  MapDrop,
  MapGroup,
  MeDot,
  Photo,
  QuietDot,
  RadiusCircle
} from '@/components/explore'
import {
  AccountNudge,
  BarFloat,
  BoardCard,
  DayRow,
  GameRow,
  GameTitle,
  LiveGameCard,
  QuietCard,
  QuietDivider,
  SheetChip,
  sheetLine,
  WidenBlock
} from '@/components/explore-board'
import { useExploreState, useShotSource } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { useLayout, useNavInsets } from '@/components/layout'
import { EASE, haptic, ScalePress, SWAP } from '@/components/motion'
import { useOnline } from '@/components/offline-banner'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import { useTourTarget } from '@/components/tour'
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
import { useFan, useWithAccount } from '@/lib/account'
import { answerPins } from '@/lib/ai-chat'
import type { ChatBar } from '@/lib/ai-events'
import { authClient } from '@/lib/auth-client'
import { formatTime, searchCenter } from '@/lib/explore'
import {
  type BoardBar,
  barsOfGame,
  chosenGame,
  dayChoices,
  distance,
  gameRow,
  type QuietBar,
  quietBars,
  type RowGame,
  withChosenDay
} from '@/lib/explore-board'
import { useFavorites } from '@/lib/favorites'
import {
  applyShortcut,
  defaultShortcuts,
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

/** O dia de hoje em Brasília, como a régua recebe (`AAAA-MM-DD`). */
const today = () => brasiliaDay(Date.now())

/** Um bar da lista: com o jogo (régua) ou sem jogo marcado. */
type AnyBar = BoardBar | QuietBar

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
  // As peças que o passeio guiado cerca (rodada 5, 3b).
  const tourGames = useTourTarget('jogos')
  const tourSheet = useTourTarget('folha')
  const tourFilters = useTourTarget('filtros')
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const session = authClient.useSession()
  const soon = useSoon()
  const tabSpace = useTabBarSpace()
  const layout = useLayout()
  // A área do app (no Android em tela grande, sem a barra de tarefas).
  const { width, height } = layout
  const navInsets = useNavInsets()
  // Celular (e Duo fechado): o mapa na tela toda e a lista numa folha. No
  // tablet e no dobrável aberto (T1 do design adaptativo), a lista à esquerda
  // e o mapa ao lado (`split`), ou o mapa em cima e a lista numa folha
  // embaixo (`stack`, rodada 9).
  const phone = layout.kind === 'phone' || layout.kind === 'duoClosed'
  const stack = layout.kind === 'stack'
  // Meio dobrado na mesa (Duo em laptop, Flex Mode): o mapa em cima, a lista
  // embaixo da dobra. Tela de fora do Flip: só o bar mais perto (`Cover`).
  const table = layout.kind === 'table'
  // Tablet deitado (iPad, Galaxy Tab; rodada 9): tocar no bar da lista o
  // escolhe, com o contorno acid, e o mapa centra na gota dele; tocar de novo
  // abre a página. No dobrável aberto e no Duo, a página do bar abre na outra
  // metade, no lugar do mapa, sem nada atravessando a dobra.
  const tablet =
    layout.kind === 'split' &&
    (layout.nav === 'rail' || (layout.nav === 'float' && Platform.OS === 'ios'))
  const besideList = layout.kind === 'split' && !tablet
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
  // Sem conta: sem cidade do perfil nem preferências (o app abre aberto).
  const fan = useFan()
  const withAccount = useWithAccount()
  const city = useQuery({ ...trpc.pubs.getMyCity.queryOptions(), enabled: fan })
  // Sem conta, a cidade escolhida no aparelho (O jogo de hoje).
  const cityData = fan ? city.data : state.localCity
  const center = searchCenter(device, cityData)
  const radiusKm = searchRadius(filters, session.data?.user.searchRadiusKm ?? 3)
  // "Ampliar" dobra o raio só nesta visita; o do perfil não muda.
  const wider = Math.min(radiusKm * 2, SEARCH_RADIUS_MAX_KM)

  const favorites = useFavorites()
  // Atalhos do topo do mapa (19e): os da pessoa, ou os padrão com o esporte
  // principal dela.
  const sportList = useQuery(trpc.pubs.getSports.queryOptions())
  const prefs = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: fan
  })
  const sports = sportList.data ?? []
  const shortcuts =
    state.shortcuts ?? defaultShortcuts(prefs.data?.[0]?.sport.slug ?? null)

  // A busca começa pelo jogo (rodada 1 do redesign): a régua do dia traz os
  // jogos perto e os bares de cada um, como no web do torcedor
  // (`lib/explore-board.ts`). O dia vem dos filtros; sem dia, hoje.
  const day = filters.date ?? today()
  const ready = device !== null || !fan || !city.isPending
  const boardInput = { ...center, radiusKm, day }
  const board = useQuery({
    ...trpc.pubs.gameBoard.queryOptions(boardInput),
    enabled: ready,
    // Trocar um filtro mantém a lista e os pinos de antes até chegar a nova,
    // em vez de piscar "Buscando bares…".
    placeholderData: keepPreviousData
  })
  const now = Date.now()
  const sportSlug =
    sports.find((sport) => sport.id === filters.sportId)?.slug ?? null
  const row = gameRow(
    board.data?.games ?? [],
    sportSlug,
    now,
    filters.league ?? null
  )
  const liveGames = row.filter((game) => game.live)
  const liveCount = liveGames.length
  const game = chosenGame(row, state.game)
  // "Ao vivo" (3c): um cartão escuro por jogo rolando, com os bares dele.
  const bars = liveOnly
    ? liveGames.flatMap((live) => barsOfGame(live, filters.amenities))
    : barsOfGame(game, filters.amenities)
  // Com menos de cinco bares no jogo, a lista continua com os bares perto
  // sem jogo marcado (decisão do dono em 21/10/2026), fora do "Ao vivo" e
  // sem "Só bares com jogo publicado".
  const few =
    !!board.data && !liveOnly && !filters.gamesOnly && bars.length < FEW_BARS
  const nearby = useQuery({
    ...trpc.pubs.barsWithoutGame.queryOptions(boardInput),
    enabled: ready && few,
    placeholderData: keepPreviousData
  })
  const quiet = few ? quietBars(nearby.data ?? [], filters.amenities, bars) : []
  // O ganho do "Ampliar", em número: quantos bares a mais passam o jogo.
  const widerBoard = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({ ...boardInput, radiusKm: wider }),
    enabled: ready && few && wider > radiusKm
  })
  const widerGame = widerBoard.data?.games.find((g) => g.key === game?.key)
  const widerGain =
    widerBoard.data && game
      ? Math.max(
          0,
          barsOfGame(widerGame, filters.amenities).length - bars.length
        )
      : null

  const open = (bar: AnyBar) => {
    // Nome e foto vão junto: a página desenha o topo antes da resposta.
    const params = {
      id: bar.barId,
      km: String(bar.distanceKm),
      name: bar.name,
      photo: bar.photoUrl ?? undefined,
      // Distância do aparelho, não do centro da cidade: vale "N min a pé".
      walk: device ? '1' : undefined
    }
    if (tablet && selected !== bar.barId) return pick(bar)
    if (!besideList) return router.push({ pathname: '/bar/[id]', params })
    // Tocar de novo no bar aberto volta ao mapa.
    if (state.beside?.id === bar.barId) return state.setBeside(null)
    haptic.select()
    state.setBeside(params)
  }
  // "Vou assistir aqui" no próximo jogo do bar (o card ao lado no 13″, a
  // tela de fora do Flip).
  const go = (bar: BoardBar) =>
    withAccount(
      () =>
        router.push({
          pathname: '/vou/[barId]',
          params: { barId: bar.barId, eventId: bar.eventId }
        }),
      { kind: 'vou', barId: bar.barId, eventId: bar.eventId }
    )
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
  // card, para sobrar mapa, 20d) e baixa (só o título). A alta para 20 pt
  // abaixo da fileira de jogos (`.sheet` alta do redesign, top 250): o dia e
  // os jogos continuam à mão.
  const top = insets.top + HEAD + 20
  const [selected, setSelected] = useState<string | null>(null)
  // Em pé, onde acaba a busca por cima do mapa (a faixa livre começa ali).
  const [headBottom, setHeadBottom] = useState(220)
  // O jogo tocado em "O jogo de hoje" chega pela URL (`?jogo=`).
  const { jogo, de } = useLocalSearchParams<{ jogo?: string; de?: string }>()
  const { setGame } = state
  useEffect(() => {
    if (!jogo) return
    setGame(jogo)
    setSelected(null)
  }, [jogo, setGame])
  // No meio, a borda da folha fica a 296 pt do pé da tela (20a, 20b).
  const snaps = [0, height - top - 296, height - top - 150 - tabSpace]
  const resting = state.resting ?? snaps[1]
  const { setResting } = state
  const expanded = resting === 0
  const reduced = useReducedMotion()

  // Onde o mapa fica: a tela toda no celular; ao lado da lista no `split`
  // (sob a navegação do Duo, à direita); de borda a borda em cima no `stack`,
  // com a busca por cima e a folha da lista subindo sobre a base dele.
  // A câmera (abrir no raio, recentrar, abrir grupo) conta sobre esta área.
  const mapBox =
    phone || cover
      ? { left: 0, width, height }
      : table
        ? { left: 0, width, height: layout.split }
        : stack
          ? {
              left: navInsets.left,
              width: width - navInsets.left - navInsets.right,
              height: Math.round(height * 0.52)
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
      ? { top: insets.top + HEAD, bottom: height - (top + snaps[1]) }
      : table
        ? // Os chips passam por cima do mapa, no topo.
          { top: insets.top + 64, bottom: 16 }
        : stack
          ? // A busca, os dias e os jogos por cima; a folha sobe 24 na base.
            { top: headBottom + 12, bottom: SHEET_OVER + 16 }
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
  // O raio inteiro na faixa livre, em toda tela (rodada 9: no iPad e no
  // dobrável também, com o círculo tracejado).
  const region = frameRegion(
    { ...center, kmTall: radiusKm * 2, kmWide: radiusKm * 2 },
    screen
  )
  const map = useRef<MapView>(null)
  const online = useOnline()
  const frameRadius = () =>
    map.current?.animateToRegion(region, reduced ? 0 : 400)
  // A região à vista decide grupos, pontos e rótulos (Rodada 20).
  const [view, setView] = useState<Region>(region)
  const [indexOf] = useState(indexCache)
  // Os sem jogo entram no mapa como ponto oco, fora dos grupos e dos rótulos.
  const listed = [...bars, ...quiet]
  const chosen = listed.find((bar) => bar.barId === selected) ?? null
  // O jogo de cada bar da lista: o escolhido, ou no "Ao vivo" o dele.
  const gameOf = (bar: AnyBar) =>
    'eventId' in bar
      ? liveOnly
        ? liveGames.find((g) => g.bars.some((b) => b.eventId === bar.eventId))
        : game
      : undefined
  const toMapBar = (bar: AnyBar): MapBar => {
    const its = gameOf(bar)
    return {
      id: bar.barId,
      name: bar.name,
      lat: bar.latitude,
      lng: bar.longitude,
      live: its?.live ?? false,
      elite: 'elite' in bar && bar.elite,
      distanceKm: bar.distanceKm,
      next: its ? Date.parse(its.startsAt) : Number.POSITIVE_INFINITY,
      // A pílula do ao vivo leva o nome (21a).
      label: bar.name
    }
  }
  // Os bares da resposta do "Ver no mapa" da busca com IA entram como gotas
  // até a pessoa mexer na busca ou voltar ao raio (`answer`).
  const mapBars = [
    ...bars.map(toMapBar),
    ...answerPins(state.answer ?? [], new Set(listed.map((bar) => bar.barId)))
  ]
  const quietPins = quiet.map(toMapBar)
  // O índice dos grupos sem o bar tocado: ele nunca entra em grupo.
  const index = indexOf(mapBars.filter((b) => b.id !== selected))
  const chosenBar =
    [...mapBars, ...quietPins].find((b) => b.id === selected) ?? null
  const layers = mapLayers(
    index,
    chosenBar,
    view,
    mapBox,
    phone ? insets.top + HEAD + 20 : padding.top,
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
    const tapped = listed.find((b) => b.barId === layer.id)
    const its = tapped ? gameOf(tapped) : undefined
    // "HOJE 21:30 · 450 m", "SÁB 21:30 · 1,2 km" ou "AO VIVO" (21a, 3b).
    const when = its
      ? `${dayLabel(its.startsAt, now)
          .split(',')[0]
          ?.replace('.', '')
          .toLocaleUpperCase('pt-BR')} ${formatTime(its.startsAt)}`
      : null
    return {
      live: layer.bar.live,
      callout: {
        name: layer.bar.name,
        when: !its
          ? null
          : layer.bar.live
            ? 'AO VIVO'
            : `${when} · ${distance(layer.bar.distanceKm)}`
      }
    }
  }
  // Bar escolhido na lista do tablet: o mapa centra na gota (300 ms) no
  // meio da faixa livre.
  const pick = (bar: AnyBar) => {
    haptic.select()
    setSelected(bar.barId)
    map.current?.animateToRegion(
      {
        ...view,
        longitude: bar.longitude,
        latitude: bar.latitude - (shift * view.latitudeDelta) / mapBox.height
      },
      reduced ? 0 : 300
    )
  }
  const dimmed = (layer: Layer) =>
    selected !== null && layer.kind !== 'selected'
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
    const bar = listed.find((b) => b.barId === layer.id)
    if (!bar) {
      const answered = state.answer?.find((b) => b.id === layer.id)
      if (answered) openAnswer(answered)
      return
    }
    if (layer.kind === 'selected') return open(bar)
    setSelected(bar.barId)
    // A folha sobe 40 pt com o card (20c): bar perto da borda dela, ou do
    // cabeçalho, ficaria coberto. A câmera desliza só o bastante para ele
    // cair no meio da faixa livre, junto com a folha.
    const y =
      ((view.latitude + view.latitudeDelta / 2 - bar.latitude) /
        view.latitudeDelta) *
      mapBox.height
    // Abaixo dos chips sobra lugar para a gota grande e o balão (105 pt).
    const ceiling = (phone ? insets.top + HEAD + 24 : padding.top) + 105
    // No celular o cartão flutuante (3b) ocupa uns 330 pt acima das abas.
    const floor = phone
      ? height - tabSpace - 400
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
  // Enquadra quando o mapa fica pronto, quando o centro muda, quando chega a
  // primeira resposta e quando a tela gira ou o dobrável abre (a caixa do
  // mapa muda); não a cada filtro, que desfaria o arrasto que a pessoa fez.
  const framed = board.data !== undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: só centro, mapa pronto, primeira resposta e caixa do mapa
  useEffect(() => {
    if (mapReady) frameRadius()
  }, [mapReady, center.lat, center.lng, framed, layout.kind, mapBox.width])
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
    if (!mapReady || board.isPlaceholderData) return
    if (framedRadius.current === radiusKm) return
    framedRadius.current = radiusKm
    frameRadius()
  }, [mapReady, board.data, radiusKm])

  // Enquanto a busca nova não chega, a lista de antes fica esmaecida: diz que
  // vai mudar sem piscar "Buscando bares…".
  const stale = board.isPlaceholderData
  const fresh = useSharedValue(1)
  useEffect(() => {
    fresh.set(withTiming(stale ? 0.5 : 1, { duration: 150, easing: EASE }))
  }, [stale, fresh])
  const listFade = useAnimatedStyle(() => ({ opacity: fresh.get() }))

  // Vindo de "O jogo de hoje", a folha sobe de baixo, a borda por onde é
  // arrastada (mola sem passo além); com menos movimento, já parada.
  const [arriving] = useState(de === 'hoje' && phone && !reduced)
  const y = useSharedValue(arriving ? height - top : resting)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na chegada
  useEffect(() => {
    // Depois do fade da troca, para a subida ser vista.
    if (arriving)
      y.set(
        withDelay(
          FADE_MS,
          withSpring(resting, { duration: 300, dampingRatio: 1 })
        )
      )
  }, [])
  // A outra aba pode ter movido a folha: esta acompanha ao voltar.
  // Na chegada a mola da subida é quem leva a folha ao lugar.
  const synced = useRef(arriving)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a folha assenta
  useEffect(() => {
    if (synced.current) {
      synced.current = false
      return
    }
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
  // Tocar num bar no celular (3b): a folha desce e dá lugar ao cartão
  // flutuante dele; soltar a traz de volta ao meio.
  // Segue o bar que está na lista: escolhido num jogo que saiu da tela
  // (outro jogo, outro dia) não esconde a folha.
  const showsFloat = phone && chosen !== null
  const placed = useRef(arriving)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a escolha muda
  useEffect(() => {
    // Na chegada, a subida já leva a folha ao meio.
    if (placed.current) {
      placed.current = false
      return
    }
    if (showsFloat) settle(height - top)
    else if (!expanded) settle(snaps[1])
  }, [showsFloat])

  const place = district ?? cityData?.name ?? 'São Paulo'
  // O dia escolhido além dos quatro (a busca abre um jogo de sábado) entra
  // no fim da fileira, para a régua dizer em que dia está.
  const days = withChosenDay(dayChoices(today()), filters.date)

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
  const column = (mapBox.width - 12) / 2

  // Em pé e na mesa, os cards em duas colunas (`columns` é a largura de
  // uma). Com um bar aberto ao lado, ele fica marcado na lista (a02).
  const beside = besideList ? state.beside : null
  // O voltar do Android fecha o bar aberto ao lado antes de sair da aba.
  const { setBeside } = state
  useEffect(() => {
    if (!beside) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setBeside(null)
      return true
    })
    return () => sub.remove()
  }, [beside, setBeside])
  const columns = stack ? column : table ? (width - 40 - 12) / 2 : 0
  // A lista (telas 3 e 3c): os bares do jogo em cartões compactos, os sem
  // jogo depois do corte e, no "Ao vivo", um cartão escuro por jogo.
  const boardCard = (bar: BoardBar) => (
    <BoardCard
      bar={bar}
      live={gameOf(bar)?.live ?? false}
      favorite={favorites.ids.has(bar.barId)}
      chosen={beside?.id === bar.barId || (tablet && selected === bar.barId)}
      onFavorite={() => favorites.toggle(bar.barId)}
      onPress={() => open(bar)}
    />
  )
  const quietCard = (bar: QuietBar) => (
    <QuietCard
      bar={bar}
      favorite={favorites.ids.has(bar.barId)}
      onFavorite={() => favorites.toggle(bar.barId)}
      onPress={() => open(bar)}
      chosen={tablet && selected === bar.barId}
    />
  )
  const cell = columns ? { width: columns } : styles.full
  const cards = liveOnly
    ? liveGames.map((live) => (
        <View key={live.key} style={styles.full}>
          <LiveGameCard
            game={live}
            bars={barsOfGame(live, filters.amenities)}
            onOpen={open}
          />
        </View>
      ))
    : [
        ...bars.map((bar) => (
          <View key={bar.eventId} style={cell}>
            {boardCard(bar)}
          </View>
        )),
        ...(quiet.length
          ? [
              <View key="corte" style={styles.full}>
                <QuietDivider alone={bars.length === 0} />
              </View>
            ]
          : []),
        ...quiet.map((bar) => (
          <View key={`sem:${bar.barId}`} style={cell}>
            {quietCard(bar)}
          </View>
        ))
      ]

  // O topo (tela 3): a marca, a busca e "Entrar" (com conta, o sino); embaixo,
  // o dia e a fileira de jogos.
  const topRow = (
    <View style={styles.topRow}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="Onside"
        style={styles.mark}
      >
        <View style={[styles.ring, { borderColor: palette.ink }]} />
        <View style={[styles.ball, { backgroundColor: palette.live }]} />
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Buscar time, bar ou bairro"
        onPress={() => router.push('/busca')}
        style={[
          styles.search,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Icon name="search" size={20} color={palette.muted} />
        <Text
          numberOfLines={1}
          style={[text(15.5, 'Regular', 1.3), { color: palette.muted }]}
          maxFontSizeMultiplier={HEAD_FONT_SCALE}
        >
          Time, bar ou bairro
        </Text>
      </Pressable>
      {fan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avisos"
          onPress={() => router.push('/avisos')}
          style={[styles.round, { backgroundColor: palette.card }]}
        >
          <Icon
            name="bell"
            size={19}
            color={palette.ink}
            accent={palette.dark ? ACID : LIVE}
          />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => withAccount(() => {})}
          style={[styles.enter, { backgroundColor: palette.ink }]}
        >
          <Text
            style={[text(14.5, 'Bold', 1.3), { color: palette.bg }]}
            maxFontSizeMultiplier={HEAD_FONT_SCALE}
          >
            Entrar
          </Text>
        </Pressable>
      )}
    </View>
  )
  const dayRow = (
    <DayRow
      days={days}
      value={day}
      onChange={(next) => {
        state.setGame(null)
        state.setFilters({ ...filters, date: next === today() ? null : next })
      }}
    />
  )
  const gameStrip = (
    <GameRow
      games={liveOnly ? liveGames : row}
      chosen={liveOnly ? undefined : game?.key}
      onChoose={(key) => {
        if (liveOnly) state.setLiveOnly(false)
        setSelected(null)
        state.setGame(key)
      }}
    />
  )

  // O título da folha: o jogo em Anton, ou "Rolando agora" no "Ao vivo".
  const sheetTitleNow = liveOnly ? (
    <Text numberOfLines={1} style={[styles.sheetTitle, { color: palette.ink }]}>
      ROLANDO <Text style={{ color: palette.live }}>AGORA</Text>
    </Text>
  ) : game ? (
    <GameTitle
      title={game.title}
      size={34}
      color={palette.ink}
      accent={palette.dark ? ACID : palette.live}
    />
  ) : (
    <Text numberOfLines={1} style={[styles.sheetTitle, { color: palette.ink }]}>
      {quiet.length ? 'BARES PERTO DE VOCÊ' : 'NENHUM JOGO'}
    </Text>
  )
  // Trocar o jogo é só estado: o título faz crossfade (150 ms).
  const sheetTitle = (
    <Animated.View
      key={liveOnly ? 'ao-vivo' : (game?.key ?? 'nada')}
      entering={SWAP}
    >
      {sheetTitleNow}
    </Animated.View>
  )
  // Sem rede (rodada 7, 14j): a hora do jogo e de quando a lista foi salva.
  const savedAt = board.dataUpdatedAt
    ? formatTime(new Date(board.dataUpdatedAt))
    : null
  const sheetLineText =
    !online && savedAt
      ? `${game ? `${formatTime(game.startsAt)} · ` : ''}salvo às ${savedAt}`
      : liveOnly
        ? `${liveGames.length} ${liveGames.length === 1 ? 'jogo' : 'jogos'} · ${bars.length} ${bars.length === 1 ? 'bar' : 'bares'} até ${radiusKm} km`
        : game
          ? sheetLine(game, bars.length, radiusKm)
          : board.data
            ? `nenhum jogo ${day === today() ? 'hoje' : 'neste dia'} até ${radiusKm} km`
            : 'buscando os jogos…'

  // Os filtros moram depois do resultado (tela 3): todos, o raio, "Ao vivo"
  // (só com jogo rolando) e os atalhos.
  const chipItems = (
    <>
      <SheetChip
        icon="pin"
        // Abre os filtros (o desenho não tem o botão próprio).
        label={`Até ${radiusKm.toLocaleString('pt-BR')} km`}
        on
        onPress={() => router.push('/filtros')}
      />
      {/* Sem a localização, a busca parte da cidade: "Trocar cidade". */}
      {device ? null : (
        <SheetChip
          icon="map"
          label={`${place} · trocar`}
          on={false}
          onPress={() => router.push('/cidade')}
        />
      )}
      {liveCount || liveOnly ? (
        <SheetChip
          live
          label={liveCount ? `Ao vivo · ${liveCount}` : 'Ao vivo'}
          on={liveOnly}
          onPress={() => {
            setSelected(null)
            state.setLiveOnly(!liveOnly)
          }}
        />
      ) : null}
      {shortcuts.map((key) => {
        const shown = shortcutLabel(key, sports)
        // O dia já tem a fileira dele.
        if (!shown || key === 'hoje' || key === 'amanha') return null
        return (
          <SheetChip
            key={key}
            icon={shown.icon}
            label={shown.label}
            on={shortcutOn(key, filters, sports, now)}
            onPress={() =>
              state.setFilters(applyShortcut(key, filters, sports, now))
            }
            onLongPress={() => router.push('/atalhos')}
          />
        )
      })}
    </>
  )
  const empty = liveOnly
    ? 'Nenhum jogo ao vivo agora por perto.'
    : row.length === 0
      ? `Nenhum jogo ${day === today() ? 'hoje' : 'neste dia'} num raio de ${radiusKm} km.`
      : 'Nenhum bar deste jogo com esses filtros.'
  const listBody = (content: ReactNode, grid?: object) => (
    <>
      {board.isError ? (
        <View style={styles.note}>
          <Text style={[text(14), { color: palette.muted }]}>
            Não deu para buscar os jogos.
          </Text>
          <Pressable onPress={() => board.refetch()} hitSlop={10}>
            <Text
              style={[text(14, 'Bold'), styles.link, { color: palette.ink }]}
            >
              Tentar de novo
            </Text>
          </Pressable>
        </View>
      ) : !board.data ? (
        <Text style={[text(14), styles.note, { color: palette.muted }]}>
          Buscando os jogos…
        </Text>
      ) : (liveOnly ? liveGames.length : bars.length + quiet.length) === 0 ? (
        <Text style={[text(14), styles.note, { color: palette.muted }]}>
          {empty}
        </Text>
      ) : (
        <Animated.View style={[{ gap: 12 }, grid, listFade]}>
          {content}
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
      ) : few && board.data && wider > radiusKm && widerGain !== 0 ? (
        // "Ampliar" (3c): o ganho em número, não um link.
        <WidenBlock
          km={wider}
          gain={widerGain}
          onWiden={() => state.setFilters({ ...filters, radius: wider })}
        />
      ) : null}
      {!fan && board.data ? (
        <AccountNudge onPress={() => router.push('/profile')} />
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
          o bar tocado continuam onde estavam), em 250 ms (rodada 9). */}
      <Animated.View
        pointerEvents="box-none"
        layout={phone || cover || reduced ? undefined : RESIZE}
        style={
          // Na tela de fora do Flip o mapa fica por baixo da foto do bar:
          // abrir o celular o mostra como estava.
          phone || cover
            ? StyleSheet.absoluteFill
            : table
              ? [styles.mapTop, { height: mapBox.height }]
              : stack
                ? [
                    styles.mapTop,
                    {
                      left: mapBox.left,
                      width: mapBox.width,
                      height: mapBox.height
                    }
                  ]
                : [styles.mapSide, { left: mapBox.left }]
        }
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            // Sem rede (rodada 7, 14j): o mapa não atualiza, então apaga a 60%.
            !online && { opacity: 0.6 }
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
                // O halo é largo (46 pt): tocar nele passa para o mapa, que solta
                // o bar tocado, em vez de engolir o toque.
                onPress={() => setSelected(null)}
              >
                <MeDot />
              </Marker>
            ) : null}
            {hoodNames(
              bars.map((bar) => ({
                neighborhood: bar.neighborhood,
                lat: bar.latitude,
                lng: bar.longitude
              })),
              layers,
              view,
              mapBox,
              phone ? insets.top + HEAD + 20 : padding.top
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
            {quietPins
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
                  draw={`${layer.count}:${layer.live}:${layer.elite}:${dimmed(layer)}`}
                  coordinate={{ latitude: layer.lat, longitude: layer.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  zIndex={2}
                  onPress={() => tapLayer(layer)}
                >
                  <View style={dimmed(layer) && { opacity: 0.45 }}>
                    <MapGroup
                      count={layer.count}
                      live={layer.live}
                      elite={layer.elite > 0}
                      dark={palette.dark}
                    />
                  </View>
                </MapMarker>
              ) : (
                <MapMarker
                  // Mudou o tipo (gota, gota com pílula, tocado), nasce outro
                  // marcador: no Apple Maps, mudar o tamanho e o `centerOffset` de
                  // um marcador vivo o deixava fora do lugar, e o `zIndex` só vale
                  // na criação (o tocado precisa ficar por cima de tudo).
                  key={`${layer.kind}:${layer.id}`}
                  // Mudou o desenho (gota virou rótulo, o tema): redesenha.
                  draw={`${layer.kind}:${layer.bar.live}:${layer.bar.elite}:${palette.dark}:${dimmed(layer)}`}
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
                  {/* Com um bar tocado, os outros apagam para 45% (3b). */}
                  <View style={dimmed(layer) && { opacity: 0.45 }}>
                    <MapDrop
                      elite={layer.bar.elite}
                      dark={palette.dark}
                      {...dropProps(layer)}
                    />
                  </View>
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
                bottom: stack
                  ? SHEET_OVER + 16
                  : table
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
            key={detail.barId}
            entering={reduced ? undefined : DETAIL_IN}
            style={[
              styles.detail,
              { top: insets.top + 6, right: navInsets.right + 20 }
            ]}
          >
            {'eventId' in detail ? boardCard(detail) : quietCard(detail)}
            {'eventId' in detail ? (
              <PillButton
                label="Vou assistir aqui"
                leading="ticket"
                height={52}
                onPress={() => go(detail)}
              />
            ) : null}
          </Animated.View>
        ) : null}
      </Animated.View>

      {phone ? (
        <>
          {/* O papel cobre o topo e se desfaz até o mapa, como no design
              (`.ex-top`): opaco até 74% do topo, nada no pé dos jogos. */}
          <LinearGradient
            pointerEvents="none"
            colors={[`rgba(${fade},1)`, `rgba(${fade},1)`, `rgba(${fade},0)`]}
            locations={[0, 0.74, 1]}
            style={[styles.fade, { height: insets.top + HEAD + 14 }]}
          />

          <View
            style={[
              styles.head,
              { top: insets.top + 8, right: 16 + navInsets.right }
            ]}
          >
            {topRow}
            {dayRow}
          </View>
          <View
            ref={tourGames}
            collapsable={false}
            style={[
              styles.chips,
              { top: insets.top + 116, right: navInsets.right }
            ]}
          >
            {gameStrip}
          </View>

          <Animated.View
            ref={tourSheet}
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
                {/* O desenho não tem "Lista": quem não arrasta abre e fecha
                    pela alça, com o leitor de tela. */}
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? 'Ver o mapa' : 'Abrir a lista'}
                  onAccessibilityTap={() => {
                    if (chosen) setSelected(null)
                    settle(expanded ? snaps[1] : 0)
                  }}
                  style={[styles.grabber, { backgroundColor: palette.grabber }]}
                />
                <View style={styles.sheetHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>{sheetTitle}</View>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.sheetLine,
                    { color: palette.muted, paddingHorizontal: 16 }
                  ]}
                >
                  {sheetLineText}
                </Text>
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
                  {chosen ? null : (
                    <View ref={tourFilters} collapsable={false}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginHorizontal: -16, flexGrow: 0 }}
                        contentContainerStyle={styles.sheetChips}
                      >
                        {chipItems}
                      </ScrollView>
                    </View>
                  )}
                  {listBody(
                    // Bar tocado no mapa (20c): a folha troca para o card dele.
                    chosen
                      ? 'eventId' in chosen
                        ? boardCard(chosen)
                        : quietCard(chosen)
                      : cards
                  )}
                </Animated.ScrollView>
              </GestureDetector>
            </GestureDetector>
            {/* Só com mais de um card: sozinho, o degradê cobriria o fim da lista. */}
            {!chosen && cards.length > 1 ? (
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
          {chosen ? (
            <View
              style={[
                styles.floatSpot,
                {
                  // No celular, 104 do pé (`.qbt9`): 20 acima da barra de abas.
                  // O `insets.bottom` aqui já conta a barra nativa, então vai
                  // a medida do desenho.
                  bottom: phone ? 104 : tabSpace + 12,
                  right: 12 + navInsets.right
                }
              ]}
            >
              <BarFloat
                key={chosen.barId}
                bar={chosen}
                game={gameOf(chosen)}
                favorite={favorites.ids.has(chosen.barId)}
                onFavorite={() => favorites.toggle(chosen.barId)}
                onClose={() => setSelected(null)}
                onOpen={() => open(chosen)}
                onGo={() => 'eventId' in chosen && go(chosen)}
              />
            </View>
          ) : null}
        </>
      ) : cover ? (
        <Cover
          bars={bars}
          game={game}
          searching={!board.data}
          onOpen={open}
          onGo={go}
        />
      ) : table ? (
        // Meio dobrado na mesa (a01d, a01g): os chips sobre o mapa, e a
        // lista em duas colunas na metade de baixo.
        <>
          <View style={[styles.chips, { top: insets.top + 12 }]}>
            {gameStrip}
          </View>
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
            {sheetTitle}
            <Text style={[styles.sheetLine, { color: palette.muted }]}>
              {sheetLineText}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginHorizontal: -20 }}
              contentContainerStyle={[
                styles.sheetChips,
                { paddingHorizontal: 20 }
              ]}
            >
              {chipItems}
            </ScrollView>
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
              {listBody(cards, styles.grid)}
            </ScrollView>
          </View>
        </>
      ) : (
        // Tablet e dobrável aberto: a coluna da lista (à esquerda do mapa), ou
        // em pé a folha que sobe sobre a base do mapa.
        <Animated.View
          pointerEvents="box-none"
          layout={reduced ? undefined : RESIZE}
          style={[
            styles.pane,
            {
              left: navInsets.left,
              // 44 do topo, como no design, abaixo da barra de status.
              paddingTop: Math.max(44, insets.top + 12),
              paddingHorizontal: pad,
              gap: stack ? 16 : 14
            },
            stack
              ? {
                  right: navInsets.right,
                  top: mapBox.height - SHEET_OVER,
                  paddingTop: 24,
                  backgroundColor: palette.bg,
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28
                }
              : { width: layout.split }
          ]}
        >
          {stack ? null : (
            <>
              {topRow}
              {dayRow}
              <View style={{ marginHorizontal: -pad }}>{gameStrip}</View>
            </>
          )}
          <View style={{ gap: 8 }}>
            <GameTitle
              title={
                liveOnly ? 'Rolando agora' : (game?.title ?? 'Nenhum jogo')
              }
              size={titleSize}
              color={palette.ink}
              accent={palette.dark ? ACID : palette.live}
            />
            <Text style={[styles.sheetLine, { color: palette.muted }]}>
              {sheetLineText}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -pad }}
            contentContainerStyle={[
              styles.sheetChips,
              { paddingHorizontal: pad }
            ]}
          >
            {chipItems}
          </ScrollView>
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
            {listBody(cards, stack ? styles.grid : undefined)}
          </ScrollView>
        </Animated.View>
      )}
      {stack ? (
        // Em pé, a busca, os dias e os jogos ficam por cima do mapa, como no
        // celular.
        <View
          pointerEvents="box-none"
          onLayout={(e) =>
            setHeadBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
          }
          style={{
            position: 'absolute',
            top: 0,
            left: navInsets.left,
            right: navInsets.right,
            paddingTop: Math.max(44, insets.top + 12),
            paddingHorizontal: pad,
            gap: 16
          }}
        >
          {topRow}
          {dayRow}
          <View style={{ marginHorizontal: -pad }}>{gameStrip}</View>
        </View>
      ) : null}
      {beside ? (
        // O bar aberto ao lado da lista (a02), no lugar do mapa, que continua
        // montado por baixo, onde estava.
        // No Duo a barra fica de pé na borda direita: a página acaba antes
        // dela, para o placar e o "Vou assistir aqui" não ficarem por baixo.
        <View
          style={[
            styles.beside,
            {
              left: mapBox.left,
              right: navInsets.right,
              backgroundColor: palette.bg
            }
          ]}
        >
          <BarDetail
            key={beside.id}
            {...beside}
            width={mapBox.width - navInsets.right}
            back={false}
          />
        </View>
      ) : null}
      {soon.toast}
    </View>
  )
}

/** O degradê da folha no meio: começa tantos pt acima da barra de abas… */
const VEIL_ABOVE_TABS = 16
/** …e chega à cor da folha nesta altura, já por baixo do vidro da barra. */
const VEIL_HEIGHT = 64

/** O zoom de rua do design adaptativo (tiles do nível 15 a 410 px). */

/** Tablet em pé com mais altura que isto (13″, Tab S11 Ultra): mapa maior. */
const TALL = 1350
/**
 * Girar o tablet ou abrir o dobrável (rodada 9): só a caixa do mapa e da lista
 * muda, em 250 ms; com movimento reduzido, troca seca.
 */
const RESIZE = LinearTransition.duration(250).easing(EASE)
/** Quanto a folha da lista sobe sobre a base do mapa, em pé. */
const SHEET_OVER = 24

/** Abaixo disso, a lista do Explorar se completa com bares sem jogo. */
const FEW_BARS = 5

/**
 * O topo do celular (marca, busca, dias e jogos) mede isto abaixo da área
 * segura: a faixa livre do mapa começa depois dele.
 */
const HEAD = 180

/** O fade da troca de "O jogo de hoje" para o Explorar. */
const FADE_MS = 300

/**
 * A tela de fora do Z Flip 8 (a01j, regra 07): o bar mais perto com o jogo em
 * tela cheia e o "Vou" à direita, longe das câmeras (embaixo à esquerda).
 * Desliza para o próximo, até cinco. O mapa fica por baixo, para abrir o
 * celular e encontrá-lo como estava.
 */
function Cover({
  bars,
  game,
  searching,
  onOpen,
  onGo
}: {
  bars: BoardBar[]
  game: RowGame | undefined
  searching: boolean
  onOpen: (bar: BoardBar) => void
  onGo: (bar: BoardBar) => void
}) {
  // A medida da própria tela (no emulador e na capa, a janela diz outra).
  const window = useWindowDimensions()
  const [{ width, height }, setSize] = useState({
    width: window.width,
    height: window.height
  })
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState(0)
  const shown = bars.slice(0, 5)
  const bar = shown[Math.min(page, shown.length - 1)]
  if (!bar || !game)
    return (
      <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
        <Text style={[text(14, 'Regular', 1.4), styles.coverEmptyText]}>
          {searching ? 'Buscando os jogos…' : 'Nenhum bar com jogo por perto.'}
        </Text>
      </View>
    )
  const live = game.live
  const where = `${live ? 'Ao vivo' : formatTime(game.startsAt)} · ${distance(bar.distanceKm)}`
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#2a2a25' }]}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
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
            key={item.eventId}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => onOpen(item)}
            style={{ width, height }}
          >
            <Photo
              uri={item.photoUrl}
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
              <Text style={styles.coverKicker} numberOfLines={1}>
                {game.title.toLocaleUpperCase('pt-BR')}
              </Text>
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
                {[
                  item.going ? `${item.going.count} vão` : item.neighborhood,
                  item.offer
                    ? item.offer.charAt(0).toLocaleLowerCase('pt-BR') +
                      item.offer.slice(1)
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View
        pointerEvents="none"
        // 26 do topo, como no design, abaixo da barra de status se houver.
        style={[styles.coverTop, { top: Math.max(26, insets.top + 8) }]}
      >
        {/* O selo reto do design (a01j), vermelho ao vivo. */}
        <View
          style={[
            styles.coverBadge,
            { backgroundColor: live ? LIVE : 'rgba(18,18,15,.7)' }
          ]}
        >
          {live ? <View style={styles.coverDot} /> : null}
          <Text style={[text(11.5, 'Bold', 1.2), { color: PAPER }]}>
            {where}
          </Text>
        </View>
        {shown.length > 1 ? (
          <View style={styles.coverDots}>
            {shown.map((item) => (
              <View
                key={item.eventId}
                style={[
                  styles.coverPage,
                  item.eventId === bar.eventId && styles.coverPageOn
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
  beside: { position: 'absolute', top: 0, bottom: 0, right: 0 },
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
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  coverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3
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
  mapTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  mapControls: { position: 'absolute', gap: 10 },
  round46: { width: 46, height: 46, borderRadius: 23 },
  detail: { position: 'absolute', width: 360, gap: 12 },
  recenter: { position: 'absolute', top: -58, right: 14 },
  floatSpot: { position: 'absolute', left: 12 },
  round44: { width: 44, height: 44, borderRadius: 22 },
  hoodName: {
    fontFamily: 'Anton',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  head: { position: 'absolute', left: 16, right: 16, gap: 10 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  mark: { width: 34, height: 34 },
  ring: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 5
  },
  ball: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 5.5
  },
  search: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  sheetLine: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13.5,
    paddingBottom: 14
  },
  sheetChips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
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
  // `.b-ink.b-sm`: 40 de altura e a sombra preta de 4.
  enter: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  sheetTitle: {
    fontFamily: 'Anton',
    fontSize: 34,
    letterSpacing: -0.5,
    flexShrink: 1,
    marginVertical: -8.2
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
