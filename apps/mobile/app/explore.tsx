import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  BarRow,
  BarTicket,
  Chip,
  MeDot,
  Pin,
  type SearchBar,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { useSoon } from '@/components/soon'
import {
  FanTabBar,
  type MenuItem,
  useTabBarSpace,
  YouMenu
} from '@/components/tab-bar'
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
import { type Coordinates, greeting, isLive, searchCenter } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * "Explorar" (2d e 2e do design): o mapa dos bares com jogo por perto, o
 * cabeçalho com a saudação, os filtros em chips de vidro, a lista numa folha
 * que arrasta e a barra de vidro do torcedor, com o menu "Você" (2c). O mapa
 * é o nativo: Apple Maps apagado no iOS, Google Maps com as cores da Onside
 * no Android (`lib/map-style.ts`).
 */

const TELAO = 1
const AREA_EXTERNA = 4

/** O dia de hoje em Brasília, como `pubs.search` recebe (`AAAA-MM-DD`). */
const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

export default function Explore() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const soon = useSoon()
  const tabSpace = useTabBarSpace()
  useStatusBar(palette.dark ? 'light' : 'dark')

  // De onde a busca parte: o aparelho (se já deu permissão), a cidade do
  // perfil ou São Paulo. Não pede permissão aqui; o onboarding já pediu.
  const [device, setDevice] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ granted }) =>
        granted
          ? Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            })
          : null
      )
      .then(async (position) => {
        if (!position) return
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
        setDevice(coords)
        // O bairro de onde a pessoa está, como o design escreve
        // ("Vila Madalena"); sem ele, fica a cidade.
        const [place] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng
        })
        setDistrict(place?.district ?? place?.subregion ?? place?.city ?? null)
      })
      .catch(() => {})
  }, [])
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const center = searchCenter(device, city.data)
  const radiusKm = session.data?.user.searchRadiusKm ?? 3

  const [liveOnly, setLiveOnly] = useState(false)
  const [todayOnly, setTodayOnly] = useState(false)
  const [amenities, setAmenities] = useState<number[]>([])
  const toggleAmenity = (id: number) =>
    setAmenities((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
    )

  const search = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm,
      date: todayOnly ? today() : undefined,
      amenities: amenities.length ? amenities : undefined,
      limit: 30
    }),
    enabled: device !== null || !city.isPending
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

  const favorites = useQuery(trpc.pubs.getFavorites.queryOptions())
  const favoriteIds = useMemo(
    () => new Set(favorites.data?.map((item) => item.barId)),
    [favorites.data]
  )
  const pending = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    retry: false,
    meta: { errorToast: false }
  })
  const refreshFavorites = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.pubs.getFavorites.queryKey()
    })
  const addFavorite = useMutation(
    trpc.pubs.favorite.mutationOptions({ onSettled: refreshFavorites })
  )
  const removeFavorite = useMutation(
    trpc.pubs.unfavorite.mutationOptions({ onSettled: refreshFavorites })
  )

  const open = (bar: SearchBar) =>
    router.push({
      pathname: '/bar/[id]',
      params: { id: bar.id, km: String(bar.distance_km) }
    })

  // A folha: alta (lista inteira), no meio (como abre) e baixa (só o título).
  const top = insets.top + 8
  const snaps = [0, height * 0.54 - top, height - top - 150 - tabSpace - 64]
  const [resting, setResting] = useState(snaps[1])
  const expanded = resting === 0

  // O centro do mapa fica na faixa entre os chips e a folha (`mapPadding`).
  const padding = {
    top: insets.top + 196,
    right: 0,
    left: 0,
    bottom: height - (top + (resting === 0 ? snaps[1] : resting))
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: muda com o centro, o raio e a folha
  useEffect(() => {
    map.current?.animateToRegion(region, 400)
  }, [center.lat, center.lng, across, resting])

  const y = useSharedValue(snaps[1])
  const start = useSharedValue(0)
  const settle = (to: number, velocity = 0) => {
    'worklet'
    y.value = withSpring(to, {
      duration: 300,
      dampingRatio: 0.8,
      velocity,
      overshootClamping: true
    })
  }
  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = y.value
    })
    .onUpdate((event) => {
      const next = start.value + event.translationY
      // Passou das pontas, resiste (elástico) em vez de parar seco.
      y.value =
        next < 0
          ? next / 3
          : next > snaps[2]
            ? snaps[2] + (next - snaps[2]) / 3
            : next
    })
    .onEnd((event) => {
      // Um peteleco basta: a velocidade escolhe o lado antes da distância.
      const projected = y.value + event.velocityY * 0.15
      let target = snaps[0]
      for (const snap of snaps)
        if (Math.abs(snap - projected) < Math.abs(target - projected))
          target = snap
      settle(target, event.velocityY)
      scheduleOnRN(setResting, target)
    })
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }]
  }))

  const user = session.data?.user
  const firstName = user?.name.split(' ')[0] ?? ''
  const initials = initialsOf(user?.name ?? '')
  const place = district ?? city.data?.name ?? 'São Paulo'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuItems: MenuItem[] = [
    { key: 'perfil', icon: 'you', label: 'Perfil' },
    { key: 'conquistas', icon: 'medal', label: 'Conquistas' },
    { key: 'reservas', icon: 'ticket', label: 'Minhas reservas' },
    {
      key: 'favoritos',
      icon: 'fan',
      label: 'Favoritos',
      meta: favorites.data?.length ? String(favorites.data.length) : undefined
    },
    {
      key: 'avaliacoes',
      icon: 'star',
      label: 'Avaliações',
      meta: pending.data?.length
        ? `${pending.data.length} ${pending.data.length === 1 ? 'pendente' : 'pendentes'}`
        : undefined
    },
    { key: 'preferencias', icon: 'sliders', label: 'Preferências' }
  ]
  // ponytail: Configurações é a seção 11; até lá a engrenagem só oferece "Sair".
  const settings = () =>
    Alert.alert(user?.name ?? 'Conta', user?.email, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await authClient.signOut()
          router.replace('/intro')
        }
      }
    ])

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
            tracksViewChanges={false}
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
            <View>
              <Text style={[text(15, 'SemiBold', 1.3), { color: palette.ink }]}>
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </Text>
              <View style={styles.place}>
                <Icon name="pin" size={13} color={palette.dark ? ACID : LIVE} />
                <Text
                  style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
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
              onPress={() => soon.show('A busca')}
            >
              <Glass tone={glassTone} interactive style={styles.round}>
                <Icon name="search" size={19} color={palette.ink} />
              </Glass>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avisos"
              onPress={() => soon.show('Avisos')}
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
        <Text style={[styles.title, { color: palette.ink }]}>
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
          onPress={() => setLiveOnly((on) => !on)}
        />
        <Chip
          label="Hoje"
          on={todayOnly}
          palette={palette}
          onPress={() => setTodayOnly((on) => !on)}
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
                  const to = expanded ? snaps[1] : 0
                  settle(to)
                  setResting(to)
                }}
                style={styles.listButton}
              >
                <Text style={[text(13, 'Bold', 1.2), { color: palette.ink }]}>
                  {expanded ? 'Mapa' : 'Lista'}
                </Text>
                <View
                  style={{
                    transform: [{ rotate: expanded ? '180deg' : '0deg' }]
                  }}
                >
                  <Icon name="arrowUp" size={14} color={palette.ink} />
                </View>
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 2,
            // A barra de vidro fica por cima: o último card sobe acima dela.
            paddingBottom: tabSpace + 64 + 24 + top,
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
                  favorite={favoriteIds.has(bar.id)}
                  onFavorite={() =>
                    favoriteIds.has(bar.id)
                      ? removeFavorite.mutate({ barId: bar.id })
                      : addFavorite.mutate({ barId: bar.id })
                  }
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
        </ScrollView>
      </Animated.View>

      {menuOpen ? (
        <YouMenu
          palette={palette}
          name={user?.name ?? ''}
          initials={initials}
          items={menuItems}
          onClose={() => setMenuOpen(false)}
          onItem={(item) => soon.show(item.label)}
          onChat={() => soon.show('A conversa com a Onside')}
          onSettings={settings}
        />
      ) : null}
      <FanTabBar
        active="explore"
        palette={palette}
        menuOpen={menuOpen}
        onTab={(tab) => {
          if (tab === 'you') setMenuOpen((on) => !on)
          else {
            setMenuOpen(false)
            if (tab === 'ranking') soon.show('O ranking')
          }
        }}
        onAi={() => soon.show('A busca com IA')}
      />
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
  who: { flexDirection: 'row', gap: 10, alignItems: 'center' },
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
  link: { textDecorationLine: 'underline' }
})
