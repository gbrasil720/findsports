import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { groupOpeningHours } from '@findsports_oficial/api/lib/opening-hours'
import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
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
  ScrollView,
  Share,
  StyleSheet,
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
import {
  Amenities,
  amenityChips,
  BarTitle,
  GameCard,
  NextGames,
  PhotoCount,
  PhotoGrid,
  WhereCard
} from '@/components/bar-wide'
import { Card, OfferCard } from '@/components/card'
import { CheckInCard } from '@/components/check-in'
import {
  BarTicket,
  dayLabel,
  dropBox,
  initials,
  MapDrop,
  PhotoPill
} from '@/components/explore'
import { Ambiente } from '@/components/gallery'
import { Glass } from '@/components/glass'
import { NAV, useLayout } from '@/components/layout'
import {
  EASE,
  haptic,
  SWAP,
  usePress,
  usePressScale
} from '@/components/motion'
import { StackRail } from '@/components/side-nav'
import { useSoon } from '@/components/soon'
import { Stars } from '@/components/stars'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  MAX_FONT_SCALE,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { clock } from '@/lib/ai-chat'
import { authClient } from '@/lib/auth-client'
import { trackCommercialEvent } from '@/lib/commercial'
import { env } from '@/lib/env'
import { formatKm, formatTime, isLive } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { byHeight } from '@/lib/layout'
import { MAP_STYLE } from '@/lib/map-style'
import { formatCode } from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * "Página do bar" (2g do design): a foto com o nome, o jogo de hoje no mesmo
 * ingresso do Explorar, o que o bar tem para ver o jogo, a oferta da casa, os
 * próximos jogos, as características, onde fica, a nota e o "Vou assistir
 * aqui" num vidro preso embaixo. Sem reserva de mesa (decisão do dono em
 * 16/10/2026, card da seção 08): quem marca recebe um código.
 *
 * "Horário" (WEB-397) só aparece com o horário informado, e "aberto agora"
 * vem do servidor. Em "O que dizem" entram a média das estrelas, os três
 * comentários mais recentes que a Onside aprovou, com o nome só de quem
 * escolheu aparecer (WEB-451), e o resumo de "O que pesou?" (WEB-398). Tudo
 * só das avaliações verificadas (WEB-408). "Ver todas" do design fica de
 * fora. "Em dia de clássico" também não entra (decisão do dono em
 * 17/10/2026).
 *
 * No dia do jogo, quem é torcedor vê "Estou aqui" (check-in, WEB-408) logo
 * abaixo do jogo.
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
/** A foto do celular; a dos tablets sai da medida da tela. */
const HERO = 340
/** A foto e o nome no tablet, pela altura da tela (gen/adapt02.js). */
const HERO_PORTRAIT: [number, number][] = [
  [1133, 320],
  [1180, 380],
  [1280, 400],
  [1376, 460],
  [1480, 520]
]
const HERO_LANDSCAPE: [number, number][] = [
  [744, 260],
  [800, 280],
  [820, 280],
  [924, 340]
]
const TITLE_PORTRAIT: [number, number][] = [
  [1133, 40],
  [1180, 46],
  [1376, 52]
]
/** A barra do "Vou assistir aqui" fora do celular. */
const DOCK = 440

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

/** A sombra do topo da foto fora do celular (coverB): só sob os botões. */
const COVER_SHADE = ['rgba(18,18,15,.45)', 'rgba(18,18,15,0)'] as const

const HERO_SHADE = [
  'rgba(18,18,15,.3)',
  'rgba(18,18,15,0)',
  'rgba(18,18,15,.82)'
] as const

type BarParams = {
  id: string
  km?: string
  name?: string
  photo?: string
  /** A distância é do aparelho: dá para dizer quantos minutos a pé. */
  walk?: string
  /** Veio da busca com IA (WEB-400): o `run_id` da resposta que citou o bar. */
  ai?: string
}

export default function BarPage() {
  return <BarDetail {...useLocalSearchParams<BarParams>()} />
}

/**
 * A página do bar. Fora do celular (WEB-488) vira duas colunas quando cabe:
 * à esquerda o nome, o jogo e a oferta; à direita onde fica, o que tem, as
 * fotos e as avaliações. No tablet a foto atravessa a tela em cima; no
 * dobrável aberto ela fica na coluna da esquerda, uma coluna de cada lado da
 * dobra.
 *
 * Para abrir ao lado da lista do Explorar (tablet deitado), passe `width` (a
 * largura que sobra) e `back={false}`: a página se ajusta a essa largura.
 */
export function BarDetail({
  id,
  km,
  name,
  photo,
  walk,
  ai,
  width: given,
  back = true
}: BarParams & { width?: number; back?: boolean }) {
  const insets = useSafeAreaInsets()
  const layout = useLayout()
  const W = given ?? layout.width
  // Fora do celular a página segue o Adaptativo 02 (WEB-488). A tela de fora
  // do Flip só sai do celular com o código (mais abaixo).
  const wide = layout.kind !== 'phone' && layout.kind !== 'cover'
  // O Duo fechado (02a): a coluna do iPhone com a faixa à direita.
  const duoClosed = !given && layout.kind === 'duoClosed'
  // Dobrável aberto ocupando a tela (02b, 02c, 02f, 02i): uma coluna de cada
  // lado da dobra, a foto na da esquerda.
  const halves =
    wide &&
    !given &&
    layout.kind === 'split' &&
    (layout.nav === 'duoRail' ||
      layout.gap > 0 ||
      layout.split * 2 >= layout.width - 2)
  // O rail do Galaxy Tab continua à esquerda da página (02q–02u).
  const tabRail = wide && !given && layout.nav === 'rail' ? NAV.rail.width : 0
  // A faixa do Duo, à direita: voltar, compartilhar e favoritar descem nela.
  const duoRail = !given && layout.nav === 'duoRail' ? NAV.duoRail.width : 0
  const pageW = W - tabRail
  // Tablet: duas colunas abaixo da foto a partir de 700 (02k–02u).
  const cols = wide && !halves && !duoClosed && pageW >= 700
  const leftW = halves ? layout.split : pageW
  const portrait = layout.height > layout.width
  const heroH = !wide
    ? HERO
    : duoClosed
      ? 250
      : halves
        ? leftW < 400
          ? 240
          : 255
        : portrait
          ? byHeight(HERO_PORTRAIT, layout.height)
          : byHeight(HERO_LANDSCAPE, layout.height)
  const heroEdge = heroH - 50
  const titleSize = duoClosed
    ? 36
    : halves
      ? leftW < 400
        ? 32
        : 36
      : portrait
        ? byHeight(TITLE_PORTRAIT, layout.height)
        : 42
  const router = useRouter()
  const palette = usePalette()
  const session = authClient.useSession()
  const soon = useSoon()
  const attendPress = usePress(0, 3)
  const goPress = usePressScale()
  const mapPress = usePressScale(0.985)
  const reportPress = usePressScale()
  const feedback = useMutation(trpc.feedback.send.mutationOptions())
  // Rota e "Vou assistir" depois da busca com IA contam como ação da
  // resposta (a métrica do teste).
  const aiAction = useMutation(trpc.ai.action.mutationOptions())
  const fromAi = (kind: 'going' | 'route') => {
    if (ai) aiAction.mutate({ runId: ai, kind, barId: id })
  }
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
    () => scrollY.get() > heroEdge,
    (past, before) => {
      if (past !== before) scheduleOnRN(setPastHero, past)
    },
    [heroEdge]
  )
  const edge = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        scrollY.get(),
        [heroEdge - 40, heroEdge],
        [0, 1],
        Extrapolation.CLAMP
      )
    }),
    [heroEdge]
  )
  const stretch = useAnimatedStyle(() => {
    const pull = Math.max(-scrollY.get(), 0)
    return {
      transform: [
        { translateY: Math.min(scrollY.get(), 0) },
        { scale: 1 + pull / heroH }
      ]
    }
  }, [heroH])

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

  // As seções da página, na ordem do celular; fora dele, em duas colunas.
  const sGame = data ? (
    next ? (
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
          favorite={favorite}
          onFavorite={toggleFavorite}
        />
      </>
    ) : (
      <Text style={[text(15), { color: palette.muted }]}>
        Nenhum jogo marcado por enquanto.
      </Text>
    )
  ) : null
  const sCheck = data ? (
    data.checkIn ? (
      <CheckInCard
        barId={data.id}
        eventId={data.checkIn.eventId}
        done={data.checkIn.done}
      />
    ) : null
  ) : null
  const sPhotos = data ? (
    <>
      {/* "O ambiente" (25a, WEB-462): as fotos que a Onside aprovou,
                logo depois de "Hoje no telão", como na 2g. */}
      <Ambiente barId={data.id} photos={data.photos} />
    </>
  ) : null
  const sTiles = data ? (
    tiles.length ? (
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Card key={tile.id} style={styles.tile}>
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
            >
              {tile.label}
            </Text>
          </Card>
        ))}
      </View>
    ) : null
  ) : null
  const sOffer = data ? (
    <>
      {/* A oferta do jogo em destaque (WEB-422): cada jogo tem a
                sua, e "Vou assistir aqui" mostra a do jogo escolhido. */}
      {next?.houseOffer ? <OfferCard offer={next.houseOffer} /> : null}
    </>
  ) : null
  const sNext = data ? (
    games.length > 1 ? (
      <>
        <Heading title="Próximos jogos aqui" aside={`${week} esta semana`} />
        <Card soft>
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
                <Text style={[styles.when, { color: palette.ink }]}>
                  {gameDay(game.startsAt, now)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[text(14.5, 'Bold', 1.4), { color: palette.ink }]}
                    numberOfLines={2}
                  >
                    {gameTitle(game)}
                  </Text>
                  {/* A hora não pode sumir com campeonato longo: o
                            campeonato encolhe, a hora fica. */}
                  <View style={styles.sub}>
                    {gameTitle(game) === game.championship ? null : (
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
                {gameTag(game) ? <Label>{gameTag(game) ?? ''}</Label> : null}
              </View>
            ))}
          </View>
        </Card>
      </>
    ) : null
  ) : null
  const sFeatures = data ? (
    features.length ? (
      <>
        <Heading title="O que tem" />
        <View style={styles.chips}>
          {features.map((label) => (
            <View
              key={label}
              style={[styles.chip, { backgroundColor: palette.mark }]}
            >
              <Text
                style={[text(11.5, 'SemiBold', 1.4), { color: palette.ink }]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </>
    ) : null
  ) : null
  const sWhere = data ? (
    located ? (
      <>
        <Heading title="Onde fica" />
        <Card soft>
          {/* Tocar no mapa abre a rota, como um mapa estático no iOS. */}
          <AnimatedPressable
            accessibilityRole="link"
            accessibilityLabel={`Como chegar ao ${data.name}`}
            onPress={() => {
              fromAi('route')
              Linking.openURL(directions(lat, lng))
            }}
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
                mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
                customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
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
                style={[text(14.5, 'Bold', 1.4), { color: palette.ink }]}
                numberOfLines={1}
              >
                {data.address}
              </Text>
              <Text
                style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
                numberOfLines={1}
              >
                {place.join(' · ')}
              </Text>
            </View>
            <AnimatedPressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => {
                fromAi('route')
                Linking.openURL(directions(lat, lng))
              }}
              onPressIn={goPress.onPressIn}
              onPressOut={goPress.onPressOut}
              style={[
                styles.go,
                { backgroundColor: palette.ink },
                goPress.style
              ]}
            >
              <Text style={[text(13, 'Bold', 1.4), { color: palette.bg }]}>
                Como chegar
              </Text>
            </AnimatedPressable>
          </View>
        </Card>
      </>
    ) : null
  ) : null
  const sHours = data ? (
    data.openingHours ? (
      <>
        <Heading
          small={wide}
          title="Horário"
          aside={
            data.openNow === null
              ? undefined
              : data.openNow
                ? 'Aberto agora'
                : 'Fechado agora'
          }
        />
        <Card soft>
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
                >
                  {row.hours ?? 'Fechado'}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </>
    ) : null
  ) : null
  const sRating = data ? (
    data.rating ? (
      <>
        <Heading
          small={wide}
          title="O que dizem"
          aside={`${data.rating.stars !== null ? `★ ${data.rating.stars.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} · ` : ''}${data.rating.total} ${data.rating.total === 1 ? 'avaliação' : 'avaliações'}`}
        />
        <View>
          <View
            style={[
              styles.scoreShadow,
              { backgroundColor: palette.dark ? '#000' : INK }
            ]}
          />
          <View style={styles.score}>
            <Text style={styles.scoreNumber}>{data.rating.percentage}%</Text>
            <Text style={[text(13.5, 'SemiBold', 1.35), styles.scoreText]}>
              dos torcedores voltariam para ver outro jogo aqui
            </Text>
          </View>
        </View>
        {data.reviews.length ? (
          <Card soft>
            <View style={styles.list}>
              {data.reviews.map((review, index) => (
                <Review key={review.id} review={review} divided={index > 0} />
              ))}
            </View>
          </Card>
        ) : null}
        {data.ratingReasons &&
        (data.ratingReasons.positive.length ||
          data.ratingReasons.negative.length) ? (
          <Card soft>
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
    ) : null
  ) : null
  const sReport = data ? (
    Platform.OS === 'ios' ? (
      <AnimatedPressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => report(data.name)}
        onPressIn={reportPress.onPressIn}
        onPressOut={reportPress.onPressOut}
        style={[styles.report, reportPress.style]}
      >
        <Text style={[text(13.5, 'SemiBold', 1.4), { color: palette.muted }]}>
          Reportar um problema
        </Text>
      </AnimatedPressable>
    ) : null
  ) : null

  const photos = data?.photos ?? []
  const openGallery = () =>
    router.push({
      pathname: '/fotos/[barId]',
      params: { barId: id, cat: 'all' }
    })
  const hero = (
    <View style={[styles.hero, { height: heroH }]}>
      <Animated.View style={[styles.heroArt, stretch]}>
        {(data ? data.photoUrl : photo) ? (
          <Image
            source={{ uri: (data ? data.photoUrl : photo) ?? undefined }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}
        <LinearGradient
          colors={wide ? COVER_SHADE : HERO_SHADE}
          locations={wide ? [0, 0.42] : [0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {wide ? (
        <PhotoCount
          total={photos.length}
          left={duoClosed}
          onPress={openGallery}
        />
      ) : (
        <View style={styles.heroText}>
          {/* O topo cresce para cima (`flex-end`): as etiquetas chegam
                acima do nome sem empurrá-lo. São vidro: entram só pela
                posição, como o corpo (com `FadeIn` o vidro não desenhava e o
                "Elite" ficava quase invisível sobre a foto). */}
          <Animated.View entering={BODY_IN} style={styles.heroPills}>
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
          >
            {(data?.name ?? name ?? '').toUpperCase()}
          </Text>
          {/* Um espaço segura a linha enquanto carrega: o nome não sobe. */}
          <Animated.Text
            key={data ? 'info' : 'wait'}
            entering={SWAP}
            style={[text(14, 'Regular', 1.4), styles.info]}
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {info.join(' · ') || ' '}
          </Animated.Text>
        </View>
      )}
    </View>
  )
  const wait = (
    <ActivityIndicator color={palette.ink} style={{ marginTop: 32 }} />
  )
  // As peças do Adaptativo 02 fora do celular.
  const wTitle = (
    <BarTitle
      name={data?.name ?? name ?? ''}
      elite={data?.plan === 'elite'}
      rating={data?.rating ?? null}
      info={[
        data?.neighborhood,
        km ? formatKm(Number(km)) : null,
        data?.averageSpendCents
          ? `R$ ${Math.round(data.averageSpendCents / 100)} por pessoa`
          : null
      ]
        .filter(Boolean)
        .join(' · ')}
      size={titleSize}
    />
  )
  const wGame = data ? (
    next ? (
      <GameCard
        game={next}
        more={games.length - 1}
        now={now}
        narrow={halves ? leftW < 380 : duoClosed && pageW - duoRail - 64 < 340}
      />
    ) : (
      <Text style={[text(15), { color: palette.muted }]}>
        Nenhum jogo marcado por enquanto.
      </Text>
    )
  ) : null
  const wOffer = next?.houseOffer ? (
    <OfferCard
      offer={next.houseOffer}
      note={data?.issuesCode ? 'Vale com o seu código.' : undefined}
    />
  ) : null
  const wNext =
    games.length > 1 ? (
      <NextGames games={games.slice(1, 1 + MORE_GAMES)} />
    ) : null
  const wWhere =
    data && located ? (
      <WhereCard
        lat={lat}
        lng={lng}
        address={[data.address, data.neighborhood].filter(Boolean).join(' · ')}
        live={pinLive}
        elite={data.plan === 'elite'}
        onRoute={() => fromAi('route')}
      />
    ) : null
  const wAmen = data ? (
    <Amenities chips={amenityChips(data.amenities, data.screenCount)} />
  ) : null
  const wPhotos = (n: number) =>
    data ? <PhotoGrid barId={data.id} photos={photos} cols={n} /> : null

  // "Vou assistir aqui": no vidro preso embaixo; na mesa, embaixo da oferta.
  const attendButton =
    going && mine ? (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: mine.attending }}
        accessibilityHint={`${gameTitle(going)}, ${dayLabel(going.startsAt, now).toLowerCase()} às ${formatTime(going.startsAt)}`}
        onPressIn={attendPress.onPressIn}
        onPressOut={attendPress.onPressOut}
        // A folha também é onde se vê o código e se desmarca.
        onPress={() => {
          fromAi('going')
          router.push({
            pathname: '/vou/[barId]',
            params: { barId: id, eventId: going.id }
          })
        }}
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
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          >
            {mine.attending ? 'Você vai' : 'Vou assistir aqui'}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    ) : null

  // Tela de fora do Z Flip 8 (02j): marcado o jogo, só o código do balcão.
  if (layout.kind === 'cover' && going && mine?.attending && mine.code)
    return (
      <View style={[styles.cover, { paddingTop: insets.top + 18 }]}>
        <View style={styles.coverTop}>
          <Text style={styles.coverKicker}>SEU CÓDIGO</Text>
          <Text style={styles.coverClock}>{clock(now)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Abre o código em tela cheia"
          onPress={() =>
            router.push({
              pathname: '/codigo/[eventId]',
              params: { eventId: going.id }
            })
          }
          style={styles.coverCard}
        >
          <View style={styles.coverHead}>
            <Text style={[text(15, 'Bold', 1.3), { color: INK }]}>
              {data?.name} · {dayLabel(going.startsAt, now).toLowerCase()}{' '}
              {formatTime(going.startsAt)}
            </Text>
            <Text style={[text(12, 'Regular', 1.4), { color: '#6b675f' }]}>
              {gameTitle(going)}
            </Text>
          </View>
          <View style={styles.coverCut} />
          <View style={styles.coverFoot}>
            <Text style={styles.coverCode}>{formatCode(mine.code)}</Text>
            <Icon name="ticket" size={30} color={INK} accent={ACID} />
          </View>
        </Pressable>
        <Text style={styles.coverNote}>
          Mostre no balcão para a oferta da casa
        </Text>
      </View>
    )

  // Meio dobrado na mesa (02d, 02g): a foto com o nome na metade de cima; o
  // jogo, a oferta e o botão na de baixo.
  if (layout.kind === 'table') {
    const twoUp = W > 800
    return (
      <View style={{ flex: 1, backgroundColor: palette.sheet }}>
        <View style={{ height: layout.split, overflow: 'hidden' }}>
          {(data ? data.photoUrl : photo) ? (
            <Image
              source={{ uri: (data ? data.photoUrl : photo) ?? undefined }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroArt]} />
          )}
          <LinearGradient
            colors={HERO_SHADE}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.tableName}>
            <Text
              style={[styles.name, styles.tableTitle]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {(data?.name ?? name ?? '').toUpperCase()}
            </Text>
            <Text
              style={[text(13, 'Regular', 1.4), styles.info]}
              numberOfLines={1}
            >
              {[
                data?.neighborhood,
                km ? formatKm(Number(km)) : null,
                data?.rating ? `${data.rating.percentage}% voltariam` : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <View style={[styles.top, { top: insets.top + 6 }]}>
            {back ? <BackButton tone="dark" /> : <View />}
            <View style={styles.actions}>
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
        </View>
        <ScrollView
          style={{ marginTop: layout.gap }}
          contentContainerStyle={[
            styles.tableBody,
            twoUp && styles.tableTwo,
            { paddingBottom: insets.bottom + 16 }
          ]}
        >
          {data ? (
            <>
              <View style={twoUp ? styles.col : null}>{wGame}</View>
              <View style={[styles.col, { gap: 12 }]}>
                {wOffer}
                {attendButton ? (
                  <Glass
                    tone={palette.dark ? 'dark' : 'light'}
                    style={[styles.dock, styles.dockInline]}
                  >
                    {attendButton}
                  </Glass>
                ) : null}
              </View>
            </>
          ) : (
            wait
          )}
        </ScrollView>
        {soon.toast}
      </View>
    )
  }

  // Os controles sobre a foto; no Duo, em coluna na faixa da direita.
  const controls = (size: number) => (
    <>
      {back ? (
        <RoundGlass label="Voltar" size={size} onPress={() => router.back()}>
          <Icon name="back" size={Math.round(size * 0.43)} color={PAPER} />
        </RoundGlass>
      ) : (
        <View />
      )}
      <View style={duoRail ? styles.column : styles.actions}>
        <RoundGlass label="Compartilhar" size={size} onPress={share}>
          <Icon name="share" size={Math.round(size * 0.43)} color={PAPER} />
        </RoundGlass>
        <RoundGlass
          label={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
          selected={favorite}
          size={size}
          onPress={toggleFavorite}
        >
          <Icon
            name="fan"
            size={Math.round(size * 0.45)}
            color={PAPER}
            accent={PAPER}
          />
        </RoundGlass>
      </View>
    </>
  )
  const extras = (
    <>
      {sHours}
      {sRating}
      {sReport}
    </>
  )

  if (wide) {
    const dockW = halves
      ? leftW - 24
      : duoClosed
        ? pageW - duoRail - 24
        : Math.min(DOCK, pageW - 48)
    const dockLeft = halves || duoClosed ? 12 : (pageW - dockW) / 2
    return (
      <View style={{ flex: 1, backgroundColor: palette.sheet }}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ marginLeft: tabRail }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          showsVerticalScrollIndicator={false}
        >
          {halves ? (
            <View style={styles.row}>
              <View style={{ width: leftW }}>
                {hero}
                <View style={[styles.stack, styles.half, { gap: 14 }]}>
                  {wTitle}
                  {data ? (
                    <>
                      {wGame}
                      {sCheck}
                      {duoRail && !layout.gap ? null : wOffer}
                    </>
                  ) : (
                    wait
                  )}
                </View>
              </View>
              <View
                style={[
                  styles.col,
                  styles.half,
                  {
                    gap: 18,
                    // A coluna da direita começa depois da dobra.
                    marginLeft: layout.gap,
                    paddingTop: insets.top + (duoRail ? 6 : 4),
                    paddingRight: 16 + duoRail
                  }
                ]}
              >
                {data ? (
                  <>
                    {duoRail && !layout.gap ? wOffer : null}
                    {wWhere}
                    {wAmen}
                    {wPhotos(4)}
                    {wNext}
                    {extras}
                  </>
                ) : null}
              </View>
            </View>
          ) : cols ? (
            <>
              {hero}
              <View style={styles.cols}>
                <View style={[styles.col, { gap: 16 }]}>
                  {wTitle}
                  {data ? (
                    <>
                      {wGame}
                      {sCheck}
                      {wOffer}
                      {wNext}
                    </>
                  ) : (
                    wait
                  )}
                </View>
                <View style={[styles.col, { gap: 18 }]}>
                  {data ? (
                    <>
                      {wWhere}
                      {wAmen}
                      {wPhotos(3)}
                      {extras}
                    </>
                  ) : null}
                </View>
              </View>
            </>
          ) : (
            <>
              {hero}
              <View
                style={[
                  styles.stack,
                  duoClosed
                    ? {
                        padding: 16,
                        paddingBottom: 0,
                        paddingRight: 16 + duoRail,
                        gap: 14
                      }
                    : { paddingTop: 18, paddingHorizontal: 24, gap: 16 }
                ]}
              >
                {wTitle}
                {data ? (
                  <>
                    {wGame}
                    {sCheck}
                    {wOffer}
                    {wWhere}
                    {wAmen}
                    {wPhotos(4)}
                    {wNext}
                    {extras}
                  </>
                ) : (
                  wait
                )}
              </View>
            </>
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

        {duoRail ? (
          // Duo (02a–02c): voltar, compartilhar e favoritar na faixa.
          <View
            style={[
              styles.column,
              styles.duoControls,
              duoClosed
                ? { right: 16, top: heroH + 14 }
                : { right: 13, top: 96 }
            ]}
          >
            {controls(duoClosed ? 50 : 56)}
          </View>
        ) : (
          <View
            style={[
              styles.top,
              {
                top: insets.top + 20,
                left: tabRail + 16,
                right: halves ? W - leftW + 16 : 16
              }
            ]}
          >
            {controls(42)}
          </View>
        )}

        {attendButton ? (
          <Glass
            tone={palette.dark ? 'dark' : 'light'}
            style={[
              styles.dock,
              {
                bottom: Math.max(insets.bottom - 6, 14) + 12,
                left: tabRail + dockLeft,
                right: undefined,
                width: dockW
              }
            ]}
          >
            {attendButton}
          </Glass>
        ) : null}
        {tabRail ? <StackRail current="explore" /> : null}
        {soon.toast}
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {hero}
        {data ? (
          <Animated.View entering={BODY_IN} style={styles.body}>
            {sGame}
            {sCheck}
            {sPhotos}
            {sTiles}
            {sOffer}
            {sNext}
            {sFeatures}
            {sWhere}
            {sHours}
            {sRating}
            {sReport}
          </Animated.View>
        ) : (
          wait
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

      {attendButton ? (
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          style={[styles.dock, { bottom: Math.max(insets.bottom - 6, 14) }]}
        >
          {attendButton}
        </Glass>
      ) : null}
      {soon.toast}
    </View>
  )
}

/**
 * Um comentário de "O que dizem" (2g): quem (ou "Anônimo"), o jogo e o mês,
 * o texto e as etiquetas. O quadrinho é acid para quem voltaria.
 */
function Review({
  review,
  divided
}: {
  review: inferRouterOutputs<AppRouter>['pubs']['getById']['reviews'][number]
  divided: boolean
}) {
  const palette = usePalette()
  const month = new Date(review.startsAt)
    .toLocaleDateString('pt-BR', {
      month: 'short',
      timeZone: 'America/Sao_Paulo'
    })
    .replace('.', '')
  return (
    <View
      style={[
        styles.said,
        divided && { borderTopWidth: 1, borderTopColor: palette.line }
      ]}
    >
      <View style={styles.saidHead}>
        <View
          style={[
            styles.saidMark,
            { backgroundColor: review.wouldReturn ? ACID : palette.mark }
          ]}
        >
          {review.name ? (
            <Text
              style={[
                text(11.5, 'Bold', 1.2),
                { color: review.wouldReturn ? INK : palette.ink }
              ]}
            >
              {initials(review.name)}
            </Text>
          ) : (
            <Icon
              name={review.wouldReturn ? 'fan' : 'close'}
              size={15}
              color={review.wouldReturn ? INK : palette.ink}
              accent={review.wouldReturn ? INK : palette.accent}
            />
          )}
        </View>
        <Text
          style={[text(15, 'Bold', 1.3), { color: palette.ink, flex: 1 }]}
          numberOfLines={1}
        >
          {review.name ?? 'Anônimo'}
        </Text>
        <Text
          style={[
            text(12.5, 'Regular', 1.4),
            { color: palette.muted, flexShrink: 1 }
          ]}
          numberOfLines={1}
        >
          {gameTitle(review)} · {month}
        </Text>
      </View>
      {review.stars ? <Stars value={review.stars} size={13} /> : null}
      <Text style={[text(14, 'Regular', 1.45), { color: palette.ink }]}>
        {review.comment}
      </Text>
      {review.reasons.length ? (
        <View style={styles.chips}>
          {review.reasons.map((id) => (
            <View
              key={id}
              style={[styles.reason, { backgroundColor: palette.mark }]}
            >
              <Text style={[text(12.5, 'Bold', 1.3), { color: palette.ink }]}>
                {reasonLabel(id)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** O título de seção do design, com o número à direita ("5 esta semana"). */
function Heading({
  title,
  aside,
  small
}: {
  title: string
  aside?: string
  /** Fora do celular, o título de seção do Adaptativo 02 (15). */
  small?: boolean
}) {
  const palette = usePalette()
  return (
    <View style={styles.heading}>
      <Text
        style={[
          text(small ? 15 : 16, 'Bold', small ? 1.3 : 1.4),
          { color: palette.ink, flexShrink: 1 }
        ]}
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
function Label({ children }: { children: string }) {
  const palette = usePalette()
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
  size = 44,
  onPress,
  children
}: {
  label: string
  selected?: boolean
  size?: number
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
        style={[
          styles.round,
          size === 44
            ? null
            : { width: size, height: size, borderRadius: size / 2 }
        ]}
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
  column: { flexDirection: 'column', gap: 10 },
  duoControls: { position: 'absolute', zIndex: 40 },
  stack: { gap: 16 },
  dockInline: { position: 'relative', left: 0, right: 0 },
  tableTitle: { fontSize: 40, marginVertical: -10, letterSpacing: 0 },
  coverTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  coverClock: { fontFamily: 'GeistMono-SemiBold', fontSize: 12, color: PAPER },
  tableName: { position: 'absolute', left: 20, right: 20, bottom: 18 },
  tableBody: { paddingTop: 16, paddingHorizontal: 20, gap: 12 },
  tableTwo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cover: { flex: 1, backgroundColor: INK, paddingHorizontal: 22, gap: 10 },
  coverKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: ACID
  },
  coverCard: {
    borderRadius: 8,
    backgroundColor: PAPER,
    overflow: 'hidden',
    boxShadow: `5px 5px 0 ${ACID}`
  },
  coverHead: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 8 },
  coverCut: {
    marginHorizontal: 14,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(18,18,15,.18)'
  },
  coverFoot: {
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  coverCode: {
    fontFamily: 'Anton',
    fontSize: 40,
    letterSpacing: 2.4,
    color: INK,
    marginVertical: -10
  },
  coverNote: {
    ...text(12, 'Regular', 1.35),
    color: '#a8a49b',
    textAlign: 'right',
    paddingLeft: 150
  },
  actions: { flexDirection: 'row', gap: 10 },
  // Fora do celular: duas colunas abaixo da foto (tablet) ou uma de cada
  // lado da dobra.
  row: { flexDirection: 'row' },
  cols: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 22,
    paddingHorizontal: 24,
    alignItems: 'flex-start'
  },
  col: { flex: 1, minWidth: 0, gap: 16 },
  half: { paddingTop: 16, paddingHorizontal: 16, gap: 16 },
  title: { gap: 8 },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 3
  },
  titleName: { fontFamily: 'Anton', letterSpacing: -0.5, marginVertical: -8 },
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
