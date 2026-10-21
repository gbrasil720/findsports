import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { groupOpeningHours } from '@findsports_oficial/api/lib/opening-hours'
import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
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
  type EntryExitAnimationFunction,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Card, OfferCard } from '@/components/card'
import {
  BarTicket,
  dayLabel,
  dropBox,
  MapDrop,
  matchLine,
  type Palette,
  PhotoPill,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import {
  EASE,
  haptic,
  SWAP,
  usePress,
  usePressScale
} from '@/components/motion'
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
import { formatKm, formatTime, isLive } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * "Página do bar" (2g do design): a foto com o nome, o jogo de hoje no mesmo
 * ingresso do Explorar, o que o bar tem para ver o jogo, a oferta da casa, os
 * próximos jogos, as características, onde fica, a nota e o "Vou assistir
 * aqui" num vidro preso embaixo. Sem reserva de mesa (decisão do dono em
 * 16/10/2026, card da seção 08): quem marca recebe um código.
 *
 * "Horário" (WEB-397) só aparece com o horário informado, e "aberto agora"
 * vem do servidor. Em "O que dizem" entra o resumo de "O que pesou?"
 * (WEB-398), a favor e contra, sem nome de ninguém: a lista de avaliações
 * escritas e "Ver todas" do design ficam de fora (só há etiquetas). "Em dia
 * de clássico" também não entra (decisão do dono em 17/10/2026).
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
/**
 * O corpo chega quando a resposta chega (o topo já estava lá): sobe 8 pt em
 * 200 ms. Só posição: as etiquetas do ingresso são vidro, e vidro com
 * transparência animada por cima não desenha (somem "Ao vivo" e "Elite").
 * Com "reduzir movimento", o `withTiming` vira instantâneo.
 */
const BODY_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 8 }] },
    animations: {
      transform: [
        { translateY: withTiming(0, { duration: 200, easing: EASE }) }
      ]
    }
  }
}
/** Quantos próximos jogos a página lista: três, como o design. */
const MORE_GAMES = 3
/** Onde a foto (340) termina embaixo da barra de status. */
const HERO_EDGE = 290

/** O rótulo curto do design ("Premiere"), não o do cadastro. */
const chipLabel = (item: (typeof AMENITIES)[number]) =>
  item.id === 3 ? 'Premiere' : item.label

/** A pé, a 4,5 km/h: 0,8 km dá 11 min, como no design. */
const walkMinutes = (km: number) => Math.max(1, Math.round((km / 4.5) * 60))

/**
 * Uma etiqueta por jogo em "Próximos jogos aqui" (WEB-399), nesta ordem: o
 * torcedor marcou, passa no telão, tem o som do jogo.
 */
const gameTag = (game: {
  attendance: { attending: boolean } | null
  onBigScreen: boolean
  withSound: boolean
}) =>
  game.attendance?.attending
    ? 'Vou'
    : game.onBigScreen
      ? 'Telão'
      : game.withSound
        ? 'Som ligado'
        : null

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
  const { id, km, name, photo, walk } = useLocalSearchParams<{
    id: string
    km?: string
    name?: string
    photo?: string
    /** A distância é do aparelho: dá para dizer quantos minutos a pé. */
    walk?: string
  }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const palette = usePalette()
  const session = authClient.useSession()
  const soon = useSoon()
  const attendPress = usePress(0, 3)
  const goPress = usePressScale()
  const mapPress = usePressScale(0.985)
  const reportPress = usePressScale()
  const feedback = useMutation(trpc.feedback.send.mutationOptions())
  // Barra de status clara sobre a foto; passou dela, segue o papel.
  const [pastHero, setPastHero] = useState(false)
  useStatusBar(pastHero && !palette.dark ? 'dark' : 'light')

  const bar = useQuery(trpc.pubs.getById.queryOptions({ id }))
  const favorites = useFavorites()
  const favorite = favorites.ids.has(id)

  // Puxar para baixo estica a foto em vez de mostrar papel acima dela.
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y)
  })
  // A foto sai de baixo da barra de status em ~290: dali o topo ganha um
  // véu do fundo (scroll edge do iOS) e a barra troca de cor, uma vez só.
  useAnimatedReaction(
    () => scrollY.get() > HERO_EDGE,
    (past, before) => {
      if (past !== before) scheduleOnRN(setPastHero, past)
    }
  )
  const edge = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.get(),
      [HERO_EDGE - 40, HERO_EDGE],
      [0, 1],
      Extrapolation.CLAMP
    )
  }))
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

  // Enquanto carrega, a mesma página já desenha o topo com o nome e a foto que
  // o Explorar passou; sem eles (link direto), só o indicador.
  if (!bar.data && (bar.isError || !name)) {
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
  const games = data?.events ?? []
  const next = games[0]
  // "Vou assistir" abre no jogo marcado, senão no próximo que não começou.
  const going =
    games.find((game) => game.attendance?.attending) ??
    games.find((game) => game.attendance)
  const mine = going?.attendance
  const spend = data?.averageSpendCents
    ? `R$ ${Math.round(data.averageSpendCents / 100)} por pessoa, informado pelo bar`
    : null
  const info = data
    ? [data.neighborhood, km ? formatKm(Number(km)) : null, spend].filter(
        Boolean
      )
    : []
  const amenities = data?.amenities ?? []
  const tiles = TILES.filter((tile) => amenities.includes(tile.id))
  const features = AMENITIES.filter((item) =>
    amenities.includes(item.id)
  ).flatMap((item) =>
    // O número de telas entra logo depois do telão, como no design.
    item.id === 1 && data?.screenCount && data.screenCount > 1
      ? [chipLabel(item), `${data.screenCount} telas`]
      : [chipLabel(item)]
  )
  const week = games.filter(
    (game) => new Date(game.startsAt).getTime() < now + WEEK
  ).length
  const lat = Number(data?.latitude)
  const lng = Number(data?.longitude)
  const located = Number.isFinite(lat) && Number.isFinite(lng)
  // "A pé" só com a distância do aparelho (não do centro da cidade) e só
  // quando faz sentido andar.
  const minutes = km && walk ? walkMinutes(Number(km)) : null
  const place = [
    data?.neighborhood,
    km ? formatKm(Number(km)) : null,
    minutes && minutes <= 30 ? `${minutes} min a pé` : null
  ].filter(Boolean)

  const pinLive = next ? isLive(next, now) : false
  const pinCallout = {
    name: data?.name ?? '',
    when: !next
      ? null
      : pinLive
        ? 'AO VIVO'
        : `${dayLabel(next.startsAt, now).split(',')[0]?.replace('.', '').toLocaleUpperCase('pt-BR')} ${formatTime(next.startsAt)}`
  }
  const pin = {
    live: pinLive,
    callout: pinCallout,
    box: dropBox({ callout: pinCallout })
  }

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
            if (!message?.trim()) return haptic.error()
            feedback.mutate(
              { message: message.trim(), pageUrl: `onside://bar/${id}` },
              {
                onSuccess: () => {
                  haptic.success()
                  soon.show('Recebemos, obrigado')
                },
                onError: (error) => {
                  haptic.error()
                  Alert.alert('Não deu para enviar', error.message)
                }
              }
            )
          }
        }
      ],
      'plain-text'
    )
  const share = () =>
    Share.share({
      message: `${data?.name ?? name} na Onside: ${env.EXPO_PUBLIC_SERVER_URL}/pub/${id}`
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
            {(data ? data.photoUrl : photo) ? (
              <Image
                source={{ uri: (data ? data.photoUrl : photo) ?? undefined }}
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
            {/* O topo cresce para cima (`flex-end`): as etiquetas chegam
                acima do nome sem empurrá-lo. */}
            <Animated.View entering={SWAP} style={styles.heroPills}>
              {data?.plan === 'elite' ? (
                <PhotoPill kind="acid" height={28}>
                  <Icon name="medal" size={15} color={INK} />
                  <Text style={[text(12, 'Bold', 1.2), { color: INK }]}>
                    Elite
                  </Text>
                </PhotoPill>
              ) : null}
              {data?.rating ? (
                <PhotoPill kind="dark" height={28}>
                  <Text style={[text(12, 'Bold', 1.2), { color: PAPER }]}>
                    {data.rating.percentage}% voltariam
                  </Text>
                </PhotoPill>
              ) : null}
            </Animated.View>
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              maxFontSizeMultiplier={1.1}
            >
              {(data?.name ?? name ?? '').toUpperCase()}
            </Text>
            {/* Um espaço segura a linha enquanto carrega: o nome não sobe. */}
            <Animated.Text
              key={data ? 'info' : 'wait'}
              entering={SWAP}
              style={[text(14, 'Regular', 1.4), styles.info]}
              numberOfLines={2}
            >
              {info.join(' · ') || ' '}
            </Animated.Text>
          </View>
        </View>

        {data ? (
          <Animated.View entering={BODY_IN} style={styles.body}>
            {next ? (
              <>
                <Text style={[text(16, 'Bold', 1.4), { color: palette.ink }]}>
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
                    goingCount: next.going?.count ?? null,
                    goingInitials: next.going?.initials ?? [],
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
                        text(11.5, 'SemiBold', 1.4),
                        { color: palette.ink, textAlign: 'center' }
                      ]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.3}
                    >
                      {tile.label}
                    </Text>
                  </Card>
                ))}
              </View>
            ) : null}

            {data.houseOffer ? (
              <OfferCard palette={palette} offer={data.houseOffer} />
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
                    {games.slice(1, 1 + MORE_GAMES).map((game, index) => (
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
                        <Text
                          style={[styles.when, { color: palette.ink }]}
                          maxFontSizeMultiplier={1.25}
                        >
                          {gameDay(game.startsAt, now)}
                        </Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              text(14.5, 'Bold', 1.4),
                              { color: palette.ink }
                            ]}
                            numberOfLines={2}
                          >
                            {matchLine(game)}
                          </Text>
                          {/* A hora não pode sumir com campeonato longo: o
                            campeonato encolhe, a hora fica. */}
                          <View style={styles.sub}>
                            {matchLine(game) === game.championship ? null : (
                              <Text
                                style={[
                                  text(12, 'Regular', 1.4),
                                  { color: palette.muted, flexShrink: 1 }
                                ]}
                                numberOfLines={1}
                              >
                                {game.championship} ·{' '}
                              </Text>
                            )}
                            <Text
                              style={[
                                text(12, 'Regular', 1.4),
                                { color: palette.muted }
                              ]}
                            >
                              {dayLabel(game.startsAt, now) === 'Hoje'
                                ? 'hoje'
                                : formatTime(game.startsAt)}
                            </Text>
                          </View>
                        </View>
                        {gameTag(game) ? (
                          <Label palette={palette}>{gameTag(game) ?? ''}</Label>
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
                          text(11.5, 'SemiBold', 1.4),
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
                  {/* Tocar no mapa abre a rota, como um mapa estático no iOS. */}
                  <AnimatedPressable
                    accessibilityRole="link"
                    accessibilityLabel={`Como chegar ao ${data.name}`}
                    onPress={() => Linking.openURL(directions(lat, lng))}
                    onPressIn={mapPress.onPressIn}
                    onPressOut={mapPress.onPressOut}
                    style={[styles.map, mapPress.style]}
                  >
                    {/* O mapa não recebe toque: o toque é do botão. */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <MapView
                        style={StyleSheet.absoluteFill}
                        initialRegion={{
                          latitude: lat,
                          longitude: lng,
                          latitudeDelta: 0.006,
                          longitudeDelta: 0.012
                        }}
                        // O bar fica em 112 de 130 (o centro da faixa abaixo
                        // dos 94 pt): cabe a gota grande com o balão em cima.
                        mapPadding={{ top: 94, right: 0, bottom: 0, left: 0 }}
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
                    </View>
                    {/* A gota do bar tocado no Explorar (21a): a ponta em
                        112 de 130, o balão com o nome e o próximo jogo. */}
                    <View
                      style={[styles.mapPin, { top: 112 - pin.box.tipY }]}
                      pointerEvents="none"
                    >
                      <MapDrop
                        live={pin.live}
                        elite={data.plan === 'elite'}
                        dark={palette.dark}
                        callout={pin.callout}
                      />
                    </View>
                  </AnimatedPressable>
                  <View style={styles.where}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          text(14.5, 'Bold', 1.4),
                          { color: palette.ink }
                        ]}
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
                    <AnimatedPressable
                      accessibilityRole="link"
                      hitSlop={8}
                      onPress={() => Linking.openURL(directions(lat, lng))}
                      onPressIn={goPress.onPressIn}
                      onPressOut={goPress.onPressOut}
                      style={[
                        styles.go,
                        { backgroundColor: palette.ink },
                        goPress.style
                      ]}
                    >
                      <Text
                        style={[text(13, 'Bold', 1.4), { color: palette.bg }]}
                      >
                        Como chegar
                      </Text>
                    </AnimatedPressable>
                  </View>
                </Card>
              </>
            ) : null}

            {data.openingHours ? (
              <>
                <Heading
                  palette={palette}
                  title="Horário"
                  aside={
                    data.openNow === null
                      ? undefined
                      : data.openNow
                        ? 'Aberto agora'
                        : 'Fechado agora'
                  }
                />
                <Card palette={palette} soft>
                  <View style={styles.list}>
                    {groupOpeningHours(data.openingHours).map((row, index) => (
                      <View
                        key={row.days}
                        style={[
                          styles.hours,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: palette.line
                          }
                        ]}
                      >
                        <Text
                          style={[
                            text(13.5, 'Regular', 1.4),
                            { color: palette.ink, flexShrink: 1 }
                          ]}
                        >
                          {row.days}
                        </Text>
                        <Text
                          style={[
                            styles.mono,
                            { color: row.hours ? palette.ink : palette.muted }
                          ]}
                          maxFontSizeMultiplier={1.3}
                        >
                          {row.hours ?? 'Fechado'}
                        </Text>
                      </View>
                    ))}
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
                    <Text
                      style={styles.scoreNumber}
                      maxFontSizeMultiplier={1.3}
                    >
                      {data.rating.percentage}%
                    </Text>
                    <Text
                      style={[text(13.5, 'SemiBold', 1.35), styles.scoreText]}
                    >
                      dos torcedores voltariam para ver outro jogo aqui
                    </Text>
                  </View>
                </View>
                {data.ratingReasons &&
                (data.ratingReasons.positive.length ||
                  data.ratingReasons.negative.length) ? (
                  <Card palette={palette} soft>
                    <View style={styles.list}>
                      {(
                        [
                          [true, data.ratingReasons.positive],
                          [false, data.ratingReasons.negative]
                        ] as const
                      )
                        .filter(([, ids]) => ids.length)
                        .map(([back, ids], index) => (
                          <View
                            key={String(back)}
                            style={[
                              styles.said,
                              index > 0 && {
                                borderTopWidth: 1,
                                borderTopColor: palette.line
                              }
                            ]}
                          >
                            <View style={styles.saidHead}>
                              <View
                                style={[
                                  styles.saidMark,
                                  {
                                    backgroundColor: back ? ACID : palette.mark
                                  }
                                ]}
                              >
                                <Icon
                                  name={back ? 'fan' : 'close'}
                                  size={15}
                                  color={back ? INK : palette.ink}
                                  accent={back ? INK : palette.accent}
                                />
                              </View>
                              <Text
                                style={[
                                  text(15, 'Bold', 1.3),
                                  { color: palette.ink, flex: 1 }
                                ]}
                                numberOfLines={1}
                              >
                                {back ? 'Quem voltaria' : 'Quem não voltaria'}
                              </Text>
                              <Text
                                style={[
                                  text(12.5, 'Regular', 1.4),
                                  { color: palette.muted }
                                ]}
                              >
                                mais citados
                              </Text>
                            </View>
                            <View style={styles.chips}>
                              {ids.map((id) => (
                                <View
                                  key={id}
                                  style={[
                                    styles.reason,
                                    { backgroundColor: palette.mark }
                                  ]}
                                >
                                  <Text
                                    style={[
                                      text(12.5, 'Bold', 1.3),
                                      { color: palette.ink }
                                    ]}
                                  >
                                    {reasonLabel(id)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                    </View>
                  </Card>
                ) : null}
              </>
            ) : null}

            {Platform.OS === 'ios' ? (
              <AnimatedPressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => report(data.name)}
                onPressIn={reportPress.onPressIn}
                onPressOut={reportPress.onPressOut}
                style={[styles.report, reportPress.style]}
              >
                <Text
                  style={[
                    text(13.5, 'SemiBold', 1.4),
                    { color: palette.muted }
                  ]}
                >
                  Reportar um problema
                </Text>
              </AnimatedPressable>
            ) : null}
          </Animated.View>
        ) : (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 32 }} />
        )}
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.edge, { height: insets.top + 64 }, edge]}
      >
        <LinearGradient
          colors={[palette.sheet, palette.sheet, `${palette.sheet}00`]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

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

      {going && mine ? (
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          style={[styles.dock, { bottom: Math.max(insets.bottom - 6, 14) }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mine.attending }}
            accessibilityHint={`${matchLine(going)}, ${dayLabel(going.startsAt, now).toLowerCase()} às ${formatTime(going.startsAt)}`}
            onPressIn={attendPress.onPressIn}
            onPressOut={attendPress.onPressOut}
            // A folha também é onde se vê o código e se desmarca.
            onPress={() =>
              router.push({
                pathname: '/vou/[barId]',
                params: { barId: id, eventId: going.id }
              })
            }
            style={styles.attendSlot}
          >
            <View style={styles.attendShadow} />
            <Animated.View style={[styles.attend, attendPress.style]}>
              <Icon
                name={mine.attending ? 'check' : 'ticket'}
                size={18}
                color={INK}
                accent={INK}
              />
              <Animated.Text
                key={mine.attending ? 'on' : 'off'}
                entering={SWAP}
                style={[text(15, 'Bold', 1.2), { color: INK, flexShrink: 1 }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {mine.attending ? 'Você vai' : 'Vou assistir aqui'}
              </Animated.Text>
            </Animated.View>
          </Pressable>
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
      <Text
        style={[text(16, 'Bold', 1.4), { color: palette.ink, flexShrink: 1 }]}
      >
        {title}
      </Text>
      {aside ? (
        <Text style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}>
          {aside}
        </Text>
      ) : null}
    </View>
  )
}

/** A etiqueta cinza da lista de jogos ("Vou"). */
function Label({ palette, children }: { palette: Palette; children: string }) {
  return (
    <View style={[styles.label, { backgroundColor: palette.mark }]}>
      <Text style={[text(10.5, 'Bold', 1.2), { color: palette.ink }]}>
        {children}
      </Text>
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
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: 10,
    marginTop: 6
  },
  sub: { flexDirection: 'row', minWidth: 0 },
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
  hours: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 11
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  said: { paddingVertical: 12, gap: 10 },
  saidHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saidMark: {
    width: 30,
    height: 30,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reason: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 3 },
  map: { height: 130 },
  mapPin: {
    position: 'absolute',
    left: 0,
    right: 0,
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
  edge: { position: 'absolute', top: 0, left: 0, right: 0 },
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
  attendSlot: { flex: 1 },
  attendShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3,
    height: 52,
    borderRadius: 26,
    backgroundColor: INK
  },
  attend: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 22,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  }
})
