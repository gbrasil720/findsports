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
  withSpring
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  BarRow,
  BarTicket,
  Chip,
  initials as initialsOf,
  MeDot,
  Pin,
  type SearchBar,
  usePalette
} from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  text,
  UpDown,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { greeting, isLive, searchCenter } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * "Explorar" (2d e 2e do design): o mapa dos bares com jogo por perto, o
 * cabeçalho com a saudação, os filtros em chips de vidro, a lista numa folha
 * que arrasta; a barra de abas nativa e o menu "Você" ficam em `_layout`. O mapa
 * é o nativo: Apple Maps apagado no iOS, Google Maps com as cores da Onside
 * no Android (`lib/map-style.ts`).
 */

const TELAO = 1
const AREA_EXTERNA = 4

/** O dia de hoje em Brasília, como `pubs.search` recebe (`AAAA-MM-DD`). */
const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default function Explore() {
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
  const { device, district, liveOnly, todayOnly, amenities } = state
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const center = searchCenter(device, city.data)
  const radiusKm = state.radius ?? session.data?.user.searchRadiusKm ?? 3
  // "Ampliar" dobra o raio só nesta visita; o do perfil não muda.
  const wider = Math.min(radiusKm * 2, SEARCH_RADIUS_MAX_KM)

  const toggleAmenity = (id: number) =>
    state.setAmenities(
      amenities.includes(id)
        ? amenities.filter((item) => item !== id)
        : [...amenities, id]
    )

  const search = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm,
      date: todayOnly ? today() : undefined,
      amenities: amenities.length ? amenities : undefined,
      limit: 30
    }),
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
  const todayCount = bars.filter(
    // Jogo que começou ontem à noite e ainda rola também é "hoje".
    (bar) =>
      bar.nextEvent &&
      (isLive(bar.nextEvent, now) ||
        new Date(bar.nextEvent.startsAt).toLocaleDateString('en-CA', {
          timeZone: 'America/Sao_Paulo'
        }) === today())
  ).length

  const favorites = useFavorites()

  const open = (bar: SearchBar) =>
    router.push({
      pathname: '/bar/[id]',
      // Nome e foto vão junto: a página desenha o topo antes da resposta.
      params: {
        id: bar.id,
        km: String(bar.distance_km),
        name: bar.name,
        photo: bar.photo_url ?? undefined
      }
    })

  // A folha: alta (lista inteira), no meio (como abre) e baixa (só o título).
  const top = insets.top + 8
  const snaps = [0, height * 0.54 - top, height - top - 150 - tabSpace]
  const resting = state.resting ?? snaps[1]
  const { setResting } = state
  const expanded = resting === 0
  const reduced = useReducedMotion()

  // O centro do mapa fica na faixa entre os chips e a folha no meio
  // (`mapPadding`). Fixo: mudar o enquadramento a cada ponto da folha
  // recentrava o mapa por cima da mola.
  const padding = {
    top: insets.top + 196,
    right: 0,
    left: 0,
    bottom: height - (top + snaps[1])
  }
  // Escala de bairro, como o design (uns 2 km na largura da tela), aberta o
  // bastante para os cinco primeiros bares caberem, sem passar do raio.
  const spread = Math.max(0, ...bars.slice(0, 5).map((bar) => bar.distance_km))
  const across = Math.min(radiusKm * 2.2, Math.max(1.8, spread * 2.5))
  const kmPerPoint = across / width
  const region = {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: (kmPerPoint * (height - padding.top - padding.bottom)) / 111,
    longitudeDelta:
      (kmPerPoint * width) / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  }
  const map = useRef<MapView>(null)
  // O mapa só aceita `animateToRegion` depois de pronto: a localização que
  // chegava antes disso se perdia, e o Explorar ficava na cidade do perfil.
  const [mapReady, setMapReady] = useState(false)
  // Enquadra quando o mapa fica pronto, quando o centro muda e quando chega a
  // primeira resposta; não a cada filtro, que desfaria o arrasto que a
  // pessoa fez no mapa.
  const framed = search.data !== undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: só centro, raio, mapa pronto e primeira resposta
  useEffect(() => {
    if (mapReady) map.current?.animateToRegion(region, reduced ? 0 : 400)
  }, [mapReady, center.lat, center.lng, radiusKm, framed])

  const y = useSharedValue(resting)
  // A outra aba pode ter movido a folha: esta acompanha ao voltar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a folha assenta
  useEffect(() => {
    if (Math.abs(y.get() - resting) > 1) y.set(resting)
  }, [resting])
  const start = useSharedValue(0)
  const scrollY = useSharedValue(0)
  /** A mola da folha; quando assenta, a tela fica sabendo onde parou. */
  const settle = (to: number, velocity = 0) => {
    'worklet'
    y.set(
      withSpring(
        to,
        { duration: 300, dampingRatio: 0.8, velocity, overshootClamping: true },
        (done) => {
          if (done) scheduleOnRN(setResting, to)
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

  const title =
    todayCount > 0
      ? `${todayCount} ${todayCount === 1 ? 'bar' : 'bares'} com jogo hoje`
      : bars.length > 0
        ? `${bars.length} ${bars.length === 1 ? 'bar' : 'bares'} com jogo`
        : 'Bares com jogo'
  const glassTone = palette.dark ? 'dark' : 'light'
  const fade = palette.dark ? '18,18,15' : '241,238,230'

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <MapView
        ref={map}
        onMapReady={() => setMapReady(true)}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        mapPadding={padding}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={palette.dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsTraffic={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {device ? (
          <Marker
            coordinate={{ latitude: device.lat, longitude: device.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            // Um marcador só e parado: acompanhar a vista garante que o ponto
            // apareça mesmo quando chega depois do mapa.
            tracksViewChanges
          >
            <MeDot />
          </Marker>
        ) : null}
        {bars.map((bar) => (
          <Marker
            key={bar.id}
            coordinate={{
              latitude: Number(bar.latitude),
              longitude: Number(bar.longitude)
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            onPress={() => open(bar)}
          >
            <Pin bar={bar} now={now} />
          </Marker>
        ))}
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
        style={[styles.fade, { height: insets.top + 283 }]}
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
                <UpDown color={palette.muted} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buscar"
              onPress={() => soon.show('A busca chega em breve')}
            >
              <Glass tone={glassTone} interactive style={styles.round}>
                <Icon name="search" size={19} color={palette.ink} />
              </Glass>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avisos"
              onPress={() => soon.show('Os avisos chegam em breve')}
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
        style={[styles.chips, { top: insets.top + 159 }]}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        <Chip
          live
          label={liveCount ? `Ao vivo · ${liveCount}` : 'Ao vivo'}
          on={liveOnly}
          palette={palette}
          onPress={() => state.setLiveOnly(!liveOnly)}
        />
        <Chip
          label="Hoje"
          on={todayOnly}
          palette={palette}
          onPress={() => state.setTodayOnly(!todayOnly)}
        />
        <Chip
          icon="tv"
          label="Telão"
          on={amenities.includes(TELAO)}
          palette={palette}
          onPress={() => toggleAmenity(TELAO)}
        />
        <Chip
          icon="outdoor"
          label="Área externa"
          on={amenities.includes(AREA_EXTERNA)}
          palette={palette}
          onPress={() => toggleAmenity(AREA_EXTERNA)}
        />
      </ScrollView>

      <Animated.View
        style={[
          styles.sheet,
          { top, backgroundColor: palette.sheet },
          palette.dark && styles.sheetDark,
          sheet
        ]}
      >
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
              ) : bars.length === 0 ? (
                <Text style={[text(14), styles.note, { color: palette.muted }]}>
                  {liveOnly
                    ? 'Nenhum jogo ao vivo agora por perto.'
                    : `Nenhum bar com jogo num raio de ${radiusKm} km.`}
                </Text>
              ) : (
                bars.map((bar, index) =>
                  index === 0 ? (
                    <BarTicket
                      key={bar.id}
                      bar={bar}
                      now={now}
                      palette={palette}
                      favorite={favorites.ids.has(bar.id)}
                      onFavorite={() => favorites.toggle(bar.id)}
                      onPress={() => open(bar)}
                    />
                  ) : (
                    <BarRow
                      key={bar.id}
                      bar={bar}
                      now={now}
                      palette={palette}
                      onPress={() => open(bar)}
                    />
                  )
                )
              )}
              {search.data && bars.length > 0 ? (
                <Text
                  style={[
                    text(13.5, 'Regular', 1.3),
                    styles.end,
                    { color: palette.muted }
                  ]}
                >
                  Fim da lista no raio de {radiusKm} km
                  {wider > radiusKm ? (
                    <>
                      {' · '}
                      <Text
                        accessibilityRole="button"
                        onPress={() => state.setRadius(wider)}
                        suppressHighlighting
                        style={[
                          text(13.5, 'Bold', 1.3),
                          { color: palette.ink }
                        ]}
                      >
                        Ampliar
                      </Text>
                    </>
                  ) : null}
                </Text>
              ) : null}
            </Animated.ScrollView>
          </GestureDetector>
        </GestureDetector>
      </Animated.View>

      {soon.toast}
    </View>
  )
}

const styles = StyleSheet.create({
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
  end: { textAlign: 'center', paddingVertical: 8 }
})
