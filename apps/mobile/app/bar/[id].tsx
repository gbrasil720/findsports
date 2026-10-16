import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams } from 'expo-router'
import { type ReactNode, useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BarTicket,
  dayLabel,
  matchLine,
  type Palette,
  PhotoPill,
  PinTag,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { haptic, SWAP, usePress, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { trackCommercialEvent } from '@/lib/commercial'
import { env } from '@/lib/env'
import { formatKm, formatTime } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * "Página do bar" (2g do design): a foto com o nome, o jogo de hoje no mesmo
 * ingresso do Explorar, o que o bar tem para ver o jogo, a oferta da casa, os
 * próximos jogos, as características, onde fica, a nota e a dupla "Vou
 * assistir" e "Reservar mesa" num vidro preso embaixo. A reserva é a seção
 * 08: até lá o botão avisa que chega em breve.
 *
 * ponytail: o design ainda tem "Horário" e avaliações escritas com etiquetas;
 * o bar não cadastra horário e a avaliação da Onside é só "voltaria", então
 * as duas ficam de fora até existirem os dados.
 */

/** As características que o design desenha em ladrilho, com ícone. */
const TILES = [
  { id: 1, icon: 'tv', label: 'Telão' },
  { id: 2, icon: 'sound', label: 'Som ligado' },
  { id: 3, icon: 'premiere', label: 'Premiere' },
  { id: 4, icon: 'outdoor', label: 'Área externa' }
] as const

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const WEEK = 7 * 86_400_000

/** O rótulo curto do design ("Premiere"), não o do cadastro. */
const chipLabel = (item: (typeof AMENITIES)[number]) =>
  item.id === 3 ? 'Premiere' : item.label

/** A pé, a 4,5 km/h: 0,8 km dá 11 min, como no design. */
const walkMinutes = (km: number) => Math.max(1, Math.round((km / 4.5) * 60))

const directions = (lat: number, lng: number) =>
  Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

/** A coluna grande da lista: a hora hoje, o dia da semana nesta semana. */
function gameDay(startsAt: string, now: number) {
  if (dayLabel(startsAt, now) === 'Hoje') return formatTime(startsAt)
  const date = new Date(startsAt)
  if (date.getTime() - now < 6 * 86_400_000)
    return date
      .toLocaleDateString('pt-BR', {
        weekday: 'short',
        timeZone: 'America/Sao_Paulo'
      })
      .replace('.', '')
      .toUpperCase()
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })
}

const HERO_SHADE = [
  'rgba(18,18,15,.3)',
  'rgba(18,18,15,0)',
  'rgba(18,18,15,.82)'
] as const

export default function BarPage() {
  const { id, km, name, photo } = useLocalSearchParams<{
    id: string
    km?: string
    name?: string
    photo?: string
  }>()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const soon = useSoon()
  const reserve = usePress(0, 3)
  const attendPress = usePressScale()
  const feedback = useMutation(trpc.feedback.send.mutationOptions())
  useStatusBar('light')

  const bar = useQuery(trpc.pubs.getById.queryOptions({ id }))
  const favorites = useFavorites()
  const favorite = favorites.ids.has(id)

  // "Vou assistir" otimista: o botão acende no toque, com o háptico; volta
  // se o servidor recusar.
  const key = trpc.pubs.getById.queryKey({ id })
  type Bar = NonNullable<typeof bar.data>
  const before = useRef<Bar | undefined>(undefined)
  const attend = useMutation(
    trpc.attendance.set.mutationOptions({
      onMutate: async ({ eventId, attending }) => {
        if (attending) haptic.success()
        else haptic.select()
        await queryClient.cancelQueries({ queryKey: key })
        before.current = queryClient.getQueryData<Bar>(key)
        queryClient.setQueryData<Bar>(key, (old) =>
          old
            ? {
                ...old,
                events: old.events.map((game) =>
                  game.id === eventId && game.attendance
                    ? { ...game, attendance: { ...game.attendance, attending } }
                    : game
                )
              }
            : old
        )
      },
      onError: () => {
        haptic.error()
        queryClient.setQueryData(key, before.current)
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: key })
    })
  )

  // Puxar para baixo estica a foto em vez de mostrar papel acima dela.
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y)
  })
  const stretch = useAnimatedStyle(() => {
    const pull = Math.max(-scrollY.get(), 0)
    return {
      transform: [
        { translateY: Math.min(scrollY.get(), 0) },
        { scale: 1 + pull / 340 }
      ]
    }
  })

  // Uma visita por abertura da página, só depois de ela existir.
  const loaded = bar.isSuccess
  const fan = session.data?.user.role === 'fan'
  useEffect(() => {
    if (loaded && fan) trackCommercialEvent({ pubId: id, type: 'profile_view' })
  }, [loaded, fan, id])

  // Enquanto carrega, o topo já vem com o nome e a foto que o Explorar passou.
  if (!bar.data && !bar.isError && name) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.sheet }}>
        <View style={styles.hero}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          <LinearGradient
            colors={HERO_SHADE}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              maxFontSizeMultiplier={1.1}
            >
              {name.toUpperCase()}
            </Text>
          </View>
        </View>
        <ActivityIndicator color={palette.ink} style={{ marginTop: 32 }} />
        <View style={[styles.top, { top: insets.top + 6 }]}>
          <BackButton tone="dark" />
        </View>
      </View>
    )
  }

  if (!bar.data) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        {bar.isError ? (
          <>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir este bar.
            </Text>
            <Pressable onPress={() => bar.refetch()} hitSlop={10}>
              <Text
                style={[
                  text(15, 'Bold'),
                  { color: palette.ink, textDecorationLine: 'underline' }
                ]}
              >
                Tentar de novo
              </Text>
            </Pressable>
            <BackButton tone="light" />
          </>
        ) : (
          <ActivityIndicator color={palette.ink} />
        )}
      </View>
    )
  }

  const data = bar.data
  const now = Date.now()
  const games = data.events
  const next = games[0]
  // "Vou assistir" vale para o próximo jogo que ainda não começou.
  const going = games.find((game) => game.attendance)
  const mine = going?.attendance
  const spend = data.averageSpendCents
    ? `R$ ${Math.round(data.averageSpendCents / 100)} por pessoa, informado pelo bar`
    : null
  const info = [
    data.neighborhood,
    km ? formatKm(Number(km)) : null,
    spend
  ].filter(Boolean)
  const tiles = TILES.filter((tile) => data.amenities.includes(tile.id))
  const features = AMENITIES.filter((item) =>
    data.amenities.includes(item.id)
  ).flatMap((item) =>
    // O número de telas entra logo depois do telão, como no design.
    item.id === 1 && data.screenCount && data.screenCount > 1
      ? [chipLabel(item), `${data.screenCount} telas`]
      : [chipLabel(item)]
  )
  const week = games.filter(
    (game) => new Date(game.startsAt).getTime() < now + WEEK
  ).length
  const lat = Number(data.latitude)
  const lng = Number(data.longitude)
  const located = Number.isFinite(lat) && Number.isFinite(lng)
  const place = [
    data.neighborhood,
    km ? formatKm(Number(km)) : null,
    km ? `${walkMinutes(Number(km))} min a pé` : null
  ].filter(Boolean)
  const reservable = games.some((game) => game.acceptsReservations)

  const toggleFavorite = () => {
    haptic.select()
    favorites.toggle(id)
  }
  // ponytail: Alert.prompt só existe no iOS; no Android o link fica escondido.
  const report = (barName: string) =>
    Alert.prompt(
      'Reportar um problema',
      `O que está errado na página do ${barName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: (message?: string) => {
            if (!message?.trim()) return
            feedback.mutate(
              { message: message.trim(), pageUrl: `onside://bar/${id}` },
              {
                onSuccess: () => {
                  haptic.success()
                  soon.show('Recebemos, obrigado')
                },
                onError: (error) =>
                  Alert.alert('Não deu para enviar', error.message)
              }
            )
          }
        }
      ],
      'plain-text'
    )
  const share = () =>
    Share.share({
      message: `${data.name} na Onside: ${env.EXPO_PUBLIC_SERVER_URL}/pub/${id}`
    })

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Animated.View style={[styles.heroArt, stretch]}>
            {data.photoUrl ? (
              <Image
                source={{ uri: data.photoUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : null}
            <LinearGradient
              colors={HERO_SHADE}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View style={styles.heroText}>
            <View style={styles.heroPills}>
              {data.plan === 'elite' ? (
                <PhotoPill kind="acid" height={28}>
                  <Icon name="medal" size={15} color={INK} />
                  <Text style={[text(12, 'Bold', 1.2), { color: INK }]}>
                    Elite
                  </Text>
                </PhotoPill>
              ) : null}
              {data.rating ? (
                <PhotoPill kind="dark" height={28}>
                  <Text style={[text(12, 'Bold', 1.2), { color: PAPER }]}>
                    {data.rating.percentage}% voltariam
                  </Text>
                </PhotoPill>
              ) : null}
            </View>
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              maxFontSizeMultiplier={1.1}
            >
              {data.name.toUpperCase()}
            </Text>
            <Text
              style={[text(14, 'Regular', 1.4), styles.info]}
              numberOfLines={2}
            >
              {info.join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {next ? (
            <>
              <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
                {dayLabel(next.startsAt, now) === 'Hoje' ||
                new Date(next.startsAt).getTime() <= now
                  ? 'Hoje no telão'
                  : 'Próximo jogo'}
              </Text>
              <BarTicket
                bar={{
                  id: data.id,
                  name: data.name,
                  neighborhood: data.neighborhood,
                  photo_url: data.photoUrl,
                  plan: data.plan,
                  rating: data.rating,
                  distance_km: km ? Number(km) : null,
                  amenities: data.amenities,
                  goingCount: next.attendance?.count ?? null,
                  nextEvent: next
                }}
                now={now}
                palette={palette}
                favorite={favorite}
                onFavorite={toggleFavorite}
              />
            </>
          ) : (
            <Text style={[text(15), { color: palette.muted }]}>
              Nenhum jogo marcado por enquanto.
            </Text>
          )}

          {tiles.length ? (
            <View style={styles.tiles}>
              {tiles.map((tile) => (
                <Card key={tile.id} palette={palette} style={styles.tile}>
                  <Icon
                    name={tile.icon}
                    size={26}
                    color={palette.ink}
                    accent={palette.accent}
                  />
                  <Text
                    style={[
                      text(11.5, 'SemiBold', 1.2),
                      { color: palette.ink }
                    ]}
                  >
                    {tile.label}
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}

          {data.houseOffer ? (
            <Card palette={palette} shadow="rgba(201,241,53,.85)" offset={5}>
              <View style={styles.offer}>
                <View style={styles.offerStub}>
                  <Icon name="ticket" size={26} color={INK} />
                </View>
                <View style={styles.offerText}>
                  <Text
                    style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
                  >
                    Oferta da casa
                  </Text>
                  <Text
                    style={[text(13, 'Regular', 1.4), { color: palette.muted }]}
                  >
                    {data.houseOffer}
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          {games.length > 1 ? (
            <>
              <Heading
                palette={palette}
                title="Próximos jogos aqui"
                aside={`${week} esta semana`}
              />
              <Card palette={palette} soft>
                <View style={styles.list}>
                  {games.slice(1).map((game, index) => (
                    <View
                      key={game.id}
                      style={[
                        styles.game,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: palette.line
                        }
                      ]}
                    >
                      <Text style={[styles.when, { color: palette.ink }]}>
                        {gameDay(game.startsAt, now)}
                      </Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            text(14.5, 'Bold', 1.3),
                            { color: palette.ink }
                          ]}
                          numberOfLines={2}
                        >
                          {matchLine(game)}
                        </Text>
                        <Text
                          style={[
                            text(12, 'Regular', 1.4),
                            { color: palette.muted }
                          ]}
                          numberOfLines={1}
                        >
                          {game.championship} ·{' '}
                          {dayLabel(game.startsAt, now) === 'Hoje'
                            ? 'hoje'
                            : formatTime(game.startsAt)}
                        </Text>
                      </View>
                      {game.acceptsReservations ? (
                        <Label palette={palette}>
                          {game.reservationsSoldOut ? 'Esgotado' : 'Reserva'}
                        </Label>
                      ) : null}
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {features.length ? (
            <>
              <Heading palette={palette} title="O que tem" />
              <View style={styles.chips}>
                {features.map((label) => (
                  <View
                    key={label}
                    style={[styles.chip, { backgroundColor: palette.mark }]}
                  >
                    <Text
                      style={[
                        text(11.5, 'SemiBold', 1.2),
                        { color: palette.ink }
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {located ? (
            <>
              <Heading palette={palette} title="Onde fica" />
              <Card palette={palette} soft>
                <View style={styles.map} pointerEvents="none">
                  <MapView
                    style={StyleSheet.absoluteFill}
                    initialRegion={{
                      latitude: lat,
                      longitude: lng,
                      latitudeDelta: 0.006,
                      longitudeDelta: 0.012
                    }}
                    // O centro fica 15 pt abaixo do meio: a ponta do pino cai
                    // em 80 de 130, como no design.
                    mapPadding={{ top: 30, right: 0, bottom: 0, left: 0 }}
                    mapType={
                      Platform.OS === 'ios' ? 'mutedStandard' : 'standard'
                    }
                    customMapStyle={
                      palette.dark ? MAP_STYLE.dark : MAP_STYLE.light
                    }
                    userInterfaceStyle={palette.dark ? 'dark' : 'light'}
                    showsPointsOfInterests={false}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  />
                  <View style={styles.mapPin}>
                    <PinTag label={data.name} kind="live" />
                  </View>
                </View>
                <View style={styles.where}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
                      numberOfLines={1}
                    >
                      {data.address}
                    </Text>
                    <Text
                      style={[
                        text(12.5, 'Regular', 1.4),
                        { color: palette.muted }
                      ]}
                      numberOfLines={1}
                    >
                      {place.join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => Linking.openURL(directions(lat, lng))}
                    style={({ pressed }) => [
                      styles.go,
                      { backgroundColor: palette.ink },
                      pressed && { opacity: 0.8 }
                    ]}
                  >
                    <Text
                      style={[text(13, 'Bold', 1.2), { color: palette.bg }]}
                    >
                      Como chegar
                    </Text>
                  </Pressable>
                </View>
              </Card>
            </>
          ) : null}

          {data.rating ? (
            <>
              <Heading
                palette={palette}
                title="O que dizem"
                aside={`${data.rating.total} ${data.rating.total === 1 ? 'avaliação' : 'avaliações'}`}
              />
              <View>
                <View
                  style={[
                    styles.scoreShadow,
                    { backgroundColor: palette.dark ? '#000' : INK }
                  ]}
                />
                <View style={styles.score}>
                  <Text style={styles.scoreNumber}>
                    {data.rating.percentage}%
                  </Text>
                  <Text
                    style={[text(13.5, 'SemiBold', 1.35), styles.scoreText]}
                  >
                    dos torcedores voltariam para ver outro jogo aqui
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {Platform.OS === 'ios' ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => report(data.name)}
              style={styles.report}
            >
              <Text
                style={[text(13.5, 'SemiBold', 1.2), { color: palette.muted }]}
              >
                Reportar um problema
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.ScrollView>

      <View style={[styles.top, { top: insets.top + 6 }]}>
        <BackButton tone="dark" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundGlass label="Compartilhar" onPress={share}>
            <Icon name="share" size={19} color={PAPER} />
          </RoundGlass>
          <RoundGlass
            label={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
            selected={favorite}
            onPress={toggleFavorite}
          >
            <Icon name="fan" size={20} color={PAPER} accent={PAPER} />
          </RoundGlass>
        </View>
      </View>

      {(going && mine) || reservable ? (
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          style={[styles.dock, { bottom: Math.max(insets.bottom - 6, 14) }]}
        >
          {going && mine ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: mine.attending }}
              onPressIn={attendPress.onPressIn}
              onPressOut={attendPress.onPressOut}
              accessibilityHint={`${matchLine(going)}, ${dayLabel(going.startsAt, now).toLowerCase()} às ${formatTime(going.startsAt)}`}
              disabled={attend.isPending}
              onPress={() =>
                attend.mutate({ eventId: going.id, attending: !mine.attending })
              }
              style={[
                styles.attend,
                palette.dark && styles.attendDark,
                mine.attending && { backgroundColor: ACID },
                attendPress.style
              ]}
            >
              <Icon
                name={mine.attending ? 'check' : 'people'}
                size={19}
                color={mine.attending ? INK : palette.ink}
                accent={palette.accent}
              />
              <Animated.Text
                key={mine.attending ? 'on' : 'off'}
                entering={SWAP}
                style={[
                  text(15, 'Bold', 1.2),
                  { color: mine.attending ? INK : palette.ink }
                ]}
              >
                {mine.attending ? 'Vou assistir aqui' : 'Vou assistir'}
              </Animated.Text>
            </AnimatedPressable>
          ) : null}
          {reservable ? (
            <Pressable
              accessibilityRole="button"
              onPressIn={reserve.onPressIn}
              onPressOut={reserve.onPressOut}
              onPress={() => soon.show('A reserva de mesa chega em breve')}
              style={{ flex: 1 }}
            >
              <View style={styles.reserveShadow} />
              <Animated.View style={[styles.reserve, reserve.style]}>
                <Text style={[text(15, 'Bold', 1.2), { color: INK }]}>
                  Reservar mesa
                </Text>
              </Animated.View>
            </Pressable>
          ) : null}
        </Glass>
      ) : null}
      {soon.toast}
    </View>
  )
}

/** O título de seção do design, com o número à direita ("5 esta semana"). */
function Heading({
  palette,
  title,
  aside
}: {
  palette: Palette
  title: string
  aside?: string
}) {
  return (
    <View style={styles.heading}>
      <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
        {title}
      </Text>
      {aside ? (
        <Text style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}>
          {aside}
        </Text>
      ) : null}
    </View>
  )
}

/** A etiqueta cinza da lista de jogos ("Reserva"). */
function Label({ palette, children }: { palette: Palette; children: string }) {
  return (
    <View style={[styles.label, { backgroundColor: palette.mark }]}>
      <Text style={[text(10.5, 'Bold', 1.2), { color: palette.ink }]}>
        {children}
      </Text>
    </View>
  )
}

/** Cartão do design: fundo, contorno de 1 px e sombra dura deslocada. */
function Card({
  palette,
  shadow,
  offset = 4,
  soft,
  style,
  children
}: {
  palette: Palette
  shadow?: string
  offset?: number
  /** Mais a sombra longa e macia dos cartões de lista. */
  soft?: boolean
  style?: object
  children: ReactNode
}) {
  return (
    <View style={[style && { flex: 1 }, soft && styles.soft]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            top: offset,
            left: offset,
            right: -offset,
            bottom: -offset,
            borderRadius: 6,
            backgroundColor: shadow ?? palette.shadow
          }
        ]}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.ring },
          style
        ]}
      >
        {children}
      </View>
    </View>
  )
}

function RoundGlass({
  label,
  selected,
  onPress,
  children
}: {
  label: string
  selected?: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={8}
      onPress={onPress}
    >
      <Glass
        tone="dark"
        tint={selected ? 'rgba(232,50,12,.8)' : undefined}
        interactive
        style={styles.round}
      >
        {children}
      </Glass>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  hero: { height: 340, justifyContent: 'flex-end' },
  heroArt: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#2a2a25',
    transformOrigin: 'top'
  },
  heroText: { padding: 18 },
  heroPills: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  name: {
    fontFamily: 'Anton',
    fontSize: 52,
    color: PAPER,
    letterSpacing: -1,
    marginVertical: -12
  },
  info: { color: '#e2dfd7', marginTop: 4 },
  body: { padding: 16, gap: 14 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    paddingTop: 11,
    paddingBottom: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6
  },
  card: { borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  offer: { flexDirection: 'row' },
  offerStub: {
    width: 62,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(18,18,15,.25)',
    borderStyle: 'dashed'
  },
  offerText: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6
  },
  soft: {
    shadowColor: INK,
    shadowOpacity: 0.3,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 14 }
  },
  list: { paddingHorizontal: 14 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  // Anton 22/1 do design, sem `lineHeight` (corta no iOS): margem negativa.
  when: {
    fontFamily: 'Anton',
    fontSize: 22,
    width: 62,
    marginVertical: -5.5,
    fontVariant: ['tabular-nums']
  },
  label: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 3 },
  map: { height: 130 },
  mapPin: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 50,
    alignItems: 'center'
  },
  where: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  go: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 4 },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 6,
    backgroundColor: ACID
  },
  scoreShadow: {
    ...StyleSheet.absoluteFill,
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6
  },
  scoreNumber: {
    fontFamily: 'Anton',
    fontSize: 44,
    color: INK,
    marginVertical: -11
  },
  scoreText: { flex: 1, color: INK },
  report: { alignSelf: 'flex-end', padding: 4 },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  dock: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 70,
    borderRadius: 35,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden'
  },
  // Os dois botões dividem o vidro igual: o rótulo que cresce não empurra
  // "Reservar mesa".
  attend: {
    flex: 1,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fff'
  },
  attendDark: {
    backgroundColor: 'rgba(255,255,255,.1)',
    borderColor: 'rgba(255,255,255,.22)'
  },
  reserveShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3,
    height: 52,
    borderRadius: 26,
    backgroundColor: INK
  },
  reserve: {
    height: 52,
    borderRadius: 26,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
