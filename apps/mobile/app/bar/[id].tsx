import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import {
  groupOpeningHours,
  openingTurn,
  weekdayName
} from '@findsports_oficial/api/lib/opening-hours'
import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { LinearGradient } from 'expo-linear-gradient'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import {
  type ComponentProps,
  Fragment,
  type ReactNode,
  useEffect,
  useState
} from 'react'
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
import Svg, { Line } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'
import {
  AttendDock,
  CheckInDock,
  LiveCard,
  NextCard,
  NoGameToday,
  OfferStrip,
  SaveDock,
  SolidRound,
  TodayCard
} from '@/components/bar-page'
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
import { OfferCard } from '@/components/card'
import { CheckInCard, useCheckIn } from '@/components/check-in'
import { dayLabel, dropBox, MapDrop } from '@/components/explore'
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
import { Skeleton } from '@/components/states'
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
import { useWithAccount } from '@/lib/account'
import { clock } from '@/lib/ai-chat'
import { authClient } from '@/lib/auth-client'
import { closedNote } from '@/lib/bar-states'
import { trackCommercialEvent } from '@/lib/commercial'
import { env } from '@/lib/env'
import { formatKm, formatTime, isLive } from '@/lib/explore'
import { distance } from '@/lib/explore-board'
import { useFavorites } from '@/lib/favorites'
import { byHeight } from '@/lib/layout'
import { shortTitle } from '@/lib/maintenance-ticker'
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
/** A foto do topo (rodada 8: mais baixa, o jogo de hoje sobe). */
const HERO = 310
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
const LIVE_RED = '#e8320c'

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

/** "HOJE", "QUA 11": o dia embaixo da hora na lista de jogos (`.nx`). */
function shortDay(startsAt: string, now: number) {
  if (dayLabel(startsAt, now) === 'Hoje') return 'HOJE'
  const date = new Date(startsAt)
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString('pt-BR', {
      ...options,
      timeZone: 'America/Sao_Paulo'
    })
  return `${part({ weekday: 'short' }).replace('.', '')} ${part({ day: 'numeric' })}`.toLocaleUpperCase(
    'pt-BR'
  )
}

const directions = (lat: number, lng: number) =>
  Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

/** A sombra do topo da foto fora do celular (coverB): só sob os botões. */
const COVER_SHADE = ['rgba(18,18,15,.45)', 'rgba(18,18,15,0)'] as const

/** `.hero::after` do redesign: escurece o topo e o pé, limpo no meio. */
const HERO_SHADE = [
  'rgba(12,12,10,.35)',
  'rgba(12,12,10,0)',
  'rgba(12,12,10,0)',
  'rgba(12,12,10,.92)'
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
  const clockNow = useClockNow()
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
  // "Avisar quando marcar" (rodada 8): o aviso que já existe, do bar com os
  // seus times (ou o seu esporte, sem time), e o bar salvo junto.
  const fanAccount = session.data?.user.role === 'fan'
  const myTeams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    enabled: fanAccount
  })
  const mySports = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: fanAccount
  })
  const alert = useMutation(trpc.recommendations.setAlert.mutationOptions())
  const [alertOn, setAlertOn] = useState(false)

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
  // Puxar para baixo: elástico no topo em vez de parada seca (2g), escala
  // 1 + |y|/420 e metade do deslocamento.
  const stretch = useAnimatedStyle(() => {
    const pull = Math.max(-scrollY.get(), 0)
    return {
      transform: [
        { translateY: Math.min(scrollY.get(), 0) / 2 },
        { scale: 1 + pull / 420 }
      ]
    }
  }, [heroH])
  // Passou da foto: a faixa de papel com o nome aparece (300 → 360 pt).
  const strip = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        scrollY.get(),
        [heroH - 40, heroH + 20],
        [0, 1],
        Extrapolation.CLAMP
      )
    }),
    [heroH]
  )
  const withAccount = useWithAccount()

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
  // O relógio anda a cada 30 s: o apito troca o cartão e o rodapé sem
  // precisar reabrir a página.
  const now = clockNow
  const games = data?.events ?? []
  const next = games[0]
  // "Vou assistir" abre no jogo marcado, senão no próximo que não começou.
  const going =
    games.find((game) => game.attendance?.attending) ??
    games.find((game) => game.attendance)
  const mine = going?.attendance
  const amenities = data?.amenities ?? []
  const features = AMENITIES.filter((item) =>
    amenities.includes(item.id)
  ).flatMap((item) => {
    const icon: ComponentProps<typeof Icon>['name'] =
      TILES.find((tile) => tile.id === item.id)?.icon ?? 'check'
    // O número de telas entra logo depois do telão, como no design.
    return item.id === 1 && data?.screenCount && data.screenCount > 1
      ? [
          { label: chipLabel(item), icon },
          { label: `${data.screenCount} telas`, icon }
        ]
      : [{ label: chipLabel(item), icon }]
  })
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

  // A linha da foto (2g): bairro, distância "de você" e a nota verificada.
  const turn = data ? openingTurn(data.openingHours, new Date(now)) : null
  // "Vila Madalena · **450 m** de você · **★ 4,6** com 42 avaliações
  // verificadas": o número em papel, o resto apagado (`.hero .ln b`).
  const strong = { color: PAPER, fontFamily: 'Archivo-Bold' }
  const heroParts = data
    ? [
        data.neighborhood,
        km ? (
          <Fragment key="km">
            <Text style={strong}>{distance(Number(km))}</Text>
            {walk ? ' de você' : ''}
          </Fragment>
        ) : null,
        data.rating?.stars ? (
          <Fragment key="nota">
            <Text style={strong}>
              ★{' '}
              {data.rating.stars.toLocaleString('pt-BR', {
                maximumFractionDigits: 1
              })}
            </Text>
          </Fragment>
        ) : data.rating ? (
          `${data.rating.percentage}% voltariam`
        ) : null
      ].filter(Boolean)
    : []
  const heroInfo = heroParts.length
    ? heroParts.flatMap((part, i) => (i ? [' · ', part] : [part]))
    : null

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

  const toggleAlert = async () => {
    if (alertOn) return
    const teams = (myTeams.data ?? []).filter((team) => team.kind !== 'race')
    const targets = teams.length
      ? teams.map((team) => ({ teamId: team.id }))
      : (mySports.data ?? []).slice(0, 1).map((p) => ({ sportId: p.sport.id }))
    if (!targets.length) {
      haptic.warning()
      router.push('/onboarding/teams?edit=1' as Href)
      return
    }
    try {
      await Promise.all(
        targets.map((target) =>
          alert.mutateAsync({ barId: id, on: true, ...target })
        )
      )
      if (!favorite) favorites.toggle(id)
      haptic.success()
      setAlertOn(true)
    } catch {
      haptic.error()
    }
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
  // O jogo de hoje no bar (2g): o cartão de tinta, com a oferta dentro.
  // O jogo do momento (rodada 8): ao vivo vira o placar do bar, com a oferta
  // fora do cartão; jogo hoje, o cartão de tinta (sem código, o check-in no
  // lugar da oferta; fechado, quando o bar abre); sem jogo hoje, o próximo
  // e "Hoje não tem jogo aqui", que não deixa a página virar beco.
  // "Do momento": hoje no calendário de Brasília, ou nas próximas 12 h
  // (o UFC da madrugada não vira "Hoje não tem jogo aqui" às 23:30).
  const today = next
    ? brasiliaDay(new Date(next.startsAt)) === brasiliaDay(new Date(now)) ||
      new Date(next.startsAt).getTime() - now < 12 * 3_600_000
    : false
  const sGame = data ? (
    next && pinLive ? (
      <>
        <LiveCard game={next} screens={data.screenCount ?? null} />
        {next.houseOffer ? <OfferStrip offer={next.houseOffer} /> : null}
      </>
    ) : next && today ? (
      <TodayCard
        game={next}
        now={now}
        noCode={!data.issuesCode}
        closedNote={closedNote(turn, formatTime(next.startsAt))}
      />
    ) : (
      <>
        {next ? <NextCard game={next} /> : null}
        <NoGameToday
          on={alertOn}
          busy={alert.isPending}
          onAlert={() => withAccount(toggleAlert, { kind: 'fav', barId: id })}
        />
      </>
    )
  ) : null
  // Ao vivo e ainda sem check-in, o "Estou aqui" vai para o rodapé.
  const checkInDock =
    !!data?.checkIn &&
    !data.checkIn.done &&
    pinLive &&
    data.checkIn.eventId === next?.id
  const sCheck = data ? (
    // O cartão fica só para o check-in feito ("Presença confirmada");
    // o "Estou aqui" é o rodapé do jogo ao vivo (rodada 8).
    data.checkIn?.done ? (
      <CheckInCard
        barId={data.id}
        barName={data.name}
        eventId={data.checkIn.eventId}
        done={data.checkIn.done}
        at={data.checkIn.at}
      />
    ) : null
  ) : null
  const sPhotos = data ? (
    <>
      {/* "O ambiente" (25a, WEB-462): as fotos que a Onside aprovou,
                logo depois de "Hoje no telão", como na 2g. */}
      {/* Sem galeria (Starter, ou sem foto aprovada), só a capa (rodada 8). */}
      <Ambiente
        barId={data.id}
        photos={
          data.photos.length
            ? data.photos
            : data.photoUrl
              ? [
                  {
                    id: 'capa',
                    url: data.photoUrl,
                    category: 'salao' as const,
                    caption: null,
                    createdAt: new Date(0).toISOString()
                  }
                ]
              : []
        }
      />
    </>
  ) : null
  const sNext = data ? (
    games.length > 1 ? (
      <>
        <Heading title="Próximos jogos aqui" aside={`${week} esta semana`} />
        {/* `.nx`: a hora em mono com o dia embaixo, o jogo, o campeonato e
            a etiqueta do jogo à direita. */}
        <View
          style={[
            styles.nx,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {games.slice(1, 1 + MORE_GAMES).map((game, index) => {
            const live = isLive(game, now)
            return (
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
                <View style={{ width: 64 }}>
                  <Text
                    style={[
                      styles.nxTime,
                      { color: live ? palette.live : palette.ink }
                    ]}
                  >
                    {formatTime(game.startsAt)}
                  </Text>
                  <Text style={[styles.nxDay, { color: palette.muted }]}>
                    {live ? 'AO VIVO' : shortDay(game.startsAt, now)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[text(15.5, 'Bold', 1.2), { color: palette.ink }]}
                    numberOfLines={2}
                  >
                    {gameTitle(game)}
                  </Text>
                  {gameTitle(game) === game.championship ? null : (
                    <Text
                      style={[
                        text(13, 'Regular', 1.4),
                        { color: palette.muted }
                      ]}
                      numberOfLines={1}
                    >
                      {game.championship}
                    </Text>
                  )}
                </View>
                {gameTag(game) ? <Label>{gameTag(game) ?? ''}</Label> : null}
              </View>
            )
          })}
        </View>
      </>
    ) : null
  ) : null
  const sFeatures = data ? (
    features.length ? (
      <>
        <Heading title="Em dia de jogo" />
        {/* `.amen`: duas colunas, ícone e nome. */}
        <View style={styles.amen}>
          {features.map((item) => (
            <View key={item.label} style={styles.amenItem}>
              <Icon
                name={item.icon}
                size={18}
                color={palette.ink}
                accent={palette.accent}
              />
              <Text
                style={[
                  text(14.5, 'Regular', 1.3),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </>
    ) : null
  ) : null
  // "Onde fica" (rodada 8, tela 3): o mapa com a gota grande do bar, o
  // endereço, a distância a pé, perto do metrô e estacionamento quando o bar
  // marcou, "Como chegar" (o app de mapas) e "Ligar".
  const nearby = AMENITIES.filter(
    (item) => [22, 9, 8].includes(item.id) && amenities.includes(item.id)
  )
  const sWhere = data ? (
    located ? (
      <>
        <Heading title="Onde fica" />
        <View style={styles.whereMap}>
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
            style={[styles.map, { height: 200 }, mapPress.style]}
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
                callout={undefined}
              />
            </View>
          </AnimatedPressable>
        </View>
        <View>
          <Text style={[text(17, 'Bold', 1.3), { color: palette.ink }]}>
            {data.address}
          </Text>
          <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
            {place.join(' · ')}
          </Text>
        </View>
        {nearby.length ? (
          <View style={styles.pos}>
            {nearby.map((item) => (
              <View
                key={item.id}
                style={[styles.nearChip, { backgroundColor: palette.mark }]}
              >
                <Icon
                  name={item.id === 22 ? 'metro' : 'estacionamento'}
                  size={16}
                  color={palette.ink}
                />
                <Text
                  style={[text(13.5, 'SemiBold', 1.2), { color: palette.ink }]}
                >
                  {chipLabel(item)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.whereButtons}>
          <AnimatedPressable
            accessibilityRole="link"
            onPress={() => {
              fromAi('route')
              Linking.openURL(directions(lat, lng))
            }}
            onPressIn={goPress.onPressIn}
            onPressOut={goPress.onPressOut}
            style={[styles.routeButton, goPress.style]}
          >
            <Icon name="pin" size={18} color={INK} accent={INK} />
            <Text style={[text(14.5, 'Bold', 1.2), { color: INK }]}>
              Como chegar
            </Text>
          </AnimatedPressable>
          {data.phone ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(`tel:${data.phone}`)}
              style={({ pressed }) => [
                styles.callButton,
                { borderColor: palette.line },
                pressed && { opacity: 0.7 }
              ]}
            >
              <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
                Ligar
              </Text>
            </Pressable>
          ) : null}
        </View>
      </>
    ) : null
  ) : null
  // Horário (rodada 8): a semana agrupada, o dia de hoje em tinta, e
  // "aberto agora · fecha 02:00" embaixo (fechado, em papel).
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Date(now).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'America/Sao_Paulo'
    })
  )
  const sHours = data ? (
    data.openingHours ? (
      <>
        <Heading small={wide} title="Horário" />
        <View
          style={[
            styles.hoursCard,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {groupOpeningHours(data.openingHours).map((row, index) => {
            const isToday = row.dayIndexes.includes(weekday)
            return (
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
                    isToday ? styles.monoBold : styles.mono,
                    { color: palette.ink, flexShrink: 1 }
                  ]}
                >
                  {shortDays(row.days)}
                  {isToday ? (
                    <Text style={[styles.mono, { color: palette.muted }]}>
                      {' (hoje)'}
                    </Text>
                  ) : null}
                </Text>
                <Text
                  style={[
                    isToday ? styles.monoBold : styles.mono,
                    { color: row.hours ? palette.ink : palette.muted }
                  ]}
                >
                  {row.hours?.replace(' – ', '–') ?? 'fechado'}
                </Text>
              </View>
            )
          })}
        </View>
        {turn ? (
          <Text
            style={[
              styles.monoBold,
              {
                color: turn.open
                  ? palette.dark
                    ? ACID
                    : '#5b6d0c'
                  : palette.ink
              }
            ]}
          >
            {turn.open
              ? `● aberto agora · fecha ${turn.closes}`
              : `● fechado · abre ${turn.inDays === 0 ? 'hoje' : turn.inDays === 1 ? 'amanhã' : weekdayName(turn.day)} às ${turn.opens}`}
          </Text>
        ) : null}
      </>
    ) : null
  ) : null
  // "O que dizem" (rodada 8, tela 3): a nota grande em Anton com as estrelas
  // e a régua de cada estrela, "voltariam" em porcentagem, o que pesou a
  // favor (acid) e contra, com quantas vezes, e os três comentários mais
  // recentes aprovados. Tudo só das verificadas, e a seção diz isso.
  const sRating = data ? (
    data.rating ? (
      <>
        <Heading small={wide} title="O que dizem" />
        <View
          style={[
            styles.scoreCard,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={{ maxWidth: 110 }}>
            <Text style={[styles.scoreBig, { color: palette.ink }]}>
              {data.rating.stars !== null
                ? data.rating.stars.toLocaleString('pt-BR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                  })
                : `${data.rating.percentage}%`}
            </Text>
            {data.rating.stars !== null ? (
              <Text
                accessibilityLabel={`${data.rating.stars.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de 5 estrelas`}
                style={[
                  styles.scoreStars,
                  { color: palette.dark ? ACID : '#7f9a12' }
                ]}
              >
                {'★'.repeat(Math.round(data.rating.stars))}
                <Text style={{ color: palette.mark }}>
                  {'★'.repeat(5 - Math.round(data.rating.stars))}
                </Text>
              </Text>
            ) : null}
            <Text style={[styles.scoreSmall, { color: palette.muted }]}>
              {data.rating.total}{' '}
              {data.rating.total === 1
                ? 'avaliação verificada'
                : 'avaliações verificadas'}
            </Text>
          </View>
          {data.ratingDetail ? (
            <View style={{ flex: 1, gap: 6 }}>
              {data.ratingDetail.stars.map((row) => (
                <View
                  key={row.star}
                  style={styles.barRow}
                  accessible
                  accessibilityLabel={`${row.star} ${row.star === 1 ? 'estrela' : 'estrelas'}: ${row.count} ${row.count === 1 ? 'avaliação' : 'avaliações'}`}
                >
                  <Text style={[styles.barLabel, { color: palette.muted }]}>
                    {row.star}
                  </Text>
                  <View
                    style={[styles.barTrack, { backgroundColor: palette.mark }]}
                  >
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(row.count / Math.max(1, ...(data.ratingDetail?.stars ?? []).map((row) => row.count))) * 100}%`,
                          backgroundColor: palette.ink
                        }
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      { color: palette.muted, width: 22, textAlign: 'right' }
                    ]}
                  >
                    {row.count}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {data.rating.stars !== null ? (
          <View style={styles.vt}>
            <Text style={[styles.vtBig, { color: palette.ink }]}>
              {data.rating.percentage}%
            </Text>
            <Text
              style={[
                text(14, 'Regular', 1.3),
                { color: palette.muted, flex: 1 }
              ]}
            >
              voltariam para ver um jogo lá
            </Text>
          </View>
        ) : null}
        {data.ratingDetail &&
        (data.ratingDetail.positive.length ||
          data.ratingDetail.negative.length) ? (
          <View style={styles.pos}>
            {[
              ...data.ratingDetail.positive.map((row) => [true, row] as const),
              ...data.ratingDetail.negative.map((row) => [false, row] as const)
            ].map(([back, row]) => (
              <View
                key={`${back}:${row.id}`}
                accessibilityLabel={`${back ? 'A favor' : 'Contra'}: ${reasonLabel(row.id as never)}, ${row.count}`}
                style={[
                  styles.posPill,
                  { backgroundColor: back ? ACID : palette.mark }
                ]}
              >
                <Text
                  style={[
                    text(13, 'SemiBold', 1.2),
                    { color: back ? INK : palette.ink }
                  ]}
                >
                  {reasonLabel(row.id as never)} · {row.count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {data.reviews.map((review) => (
          <Review key={review.id} review={review} />
        ))}
        <Text style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}>
          Só entram avaliações de quem validou o código ou fez check-in.
        </Text>
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
          locations={wide ? [0, 0.42] : [0, 0.24, 0.38, 0.86]}
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
        <>
          {/* Jogo ao vivo no bar: o selo vermelho sobre a foto (rodada 8). */}
          {pinLive ? (
            <View style={[styles.liveBadge, { top: insets.top + 54 }]}>
              <View style={styles.liveBadgeDot} />
              <Text style={styles.liveBadgeText}>AO VIVO</Text>
            </View>
          ) : null}
          <View style={styles.heroText}>
            {/* O topo cresce para cima (`flex-end`): as etiquetas chegam
                acima do nome sem empurrá-lo. São vidro: entram só pela
                posição, como o corpo (com `FadeIn` o vidro não desenhava e o
                "Elite" ficava quase invisível sobre a foto). */}
            {data?.plan === 'elite' ? (
              <View style={styles.eliteTag}>
                <Text
                  style={{
                    fontFamily: 'GeistMono-SemiBold',
                    fontSize: 11,
                    letterSpacing: 0.77,
                    color: INK
                  }}
                >
                  ELITE
                </Text>
              </View>
            ) : null}
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {(data?.name ?? name ?? '').toUpperCase()}
            </Text>
            {/* "aberto agora · até 02:00" em acid (2g); sem horário, nada. */}
            {turn ? (
              <Text style={[styles.turn, { color: turn.open ? ACID : PAPER }]}>
                {/* Fechado em papel, não em vermelho: vermelho é só ao vivo. */}
                {turn.open
                  ? `● aberto agora · até ${turn.closes}`
                  : `● fechado · abre ${turn.inDays === 0 ? 'hoje' : turn.inDays === 1 ? 'amanhã' : weekdayName(turn.day)} às ${turn.opens}`}
              </Text>
            ) : null}
            {/* Um espaço segura a linha enquanto carrega: o nome não sobe. */}
            <Animated.Text
              key={data ? 'info' : 'wait'}
              entering={SWAP}
              style={[text(15, 'Regular', 1.4), styles.info]}
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              {heroInfo || ' '}
            </Animated.Text>
          </View>
        </>
      )}
    </View>
  )
  const wait = <Skeleton />
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

  // "Vou assistir aqui": a folha marca a presença e mostra o código. Sem
  // conta, a folha de entrar com o bar e o jogo; a presença sai marcada.
  const attend = () =>
    going &&
    withAccount(
      () => {
        fromAi('going')
        router.push({
          pathname: '/vou/[barId]',
          params: { barId: id, eventId: going.id }
        })
      },
      { kind: 'vou', barId: id, eventId: going.id }
    )
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
        onPress={() => attend()}
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
          {/* Picote em SVG: borda tracejada de um lado só não desenha no
              Android nem no iOS. */}
          <Svg height={2} style={styles.coverCut}>
            <Line
              x1={0}
              y1={1}
              x2="100%"
              y2={1}
              stroke="rgba(18,18,15,.18)"
              strokeWidth={2}
              strokeDasharray="6,5"
            />
          </Svg>
          <View style={styles.coverFoot}>
            <Text style={styles.coverCode}>{formatCode(mine.code)}</Text>
            <Icon name="qr" size={30} color={INK} accent={LIVE_RED} />
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
          <PhotoCount total={photos.length} onPress={openGallery} />
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
  // Na faixa do Duo os botões ficam sobre o papel: vidro claro (02a–02c).
  const glassTone: 'light' | 'dark' =
    duoRail && !palette.dark ? 'light' : 'dark'
  const glyph = glassTone === 'light' ? INK : PAPER
  const controls = (size: number) => (
    <>
      {back ? (
        <RoundGlass
          label="Voltar"
          size={size}
          tone={glassTone}
          onPress={() => router.back()}
        >
          <Icon name="back" size={Math.round(size * 0.43)} color={glyph} />
        </RoundGlass>
      ) : (
        <View />
      )}
      <View style={duoRail ? styles.column : styles.actions}>
        <RoundGlass
          label="Compartilhar"
          size={size}
          tone={glassTone}
          onPress={share}
        >
          <Icon name="share" size={Math.round(size * 0.43)} color={glyph} />
        </RoundGlass>
        <RoundGlass
          label={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
          selected={favorite}
          size={size}
          tone={glassTone}
          onPress={toggleFavorite}
        >
          <Icon
            name="fan"
            size={Math.round(size * 0.45)}
            color={favorite ? PAPER : glyph}
            accent={favorite ? PAPER : glyph}
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
            {/* A ordem da 2g: o jogo de hoje, o ambiente, os próximos jogos,
                o que tem, o que dizem, onde fica e o horário. */}
            {sGame}
            {sCheck}
            {sPhotos}
            {sNext}
            {sFeatures}
            {sRating}
            {sWhere}
            {sHours}
            {sReport}
          </Animated.View>
        ) : (
          wait
        )}
      </Animated.ScrollView>

      {/* Passou da foto: faixa de papel com o nome (a foto é o título). */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.strip,
          {
            height: insets.top + 52,
            paddingTop: insets.top,
            backgroundColor: palette.sheet,
            borderBottomColor: palette.line
          },
          strip
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.stripName, { color: palette.ink }]}
        >
          {(data?.name ?? name ?? '').toUpperCase()}
        </Text>
      </Animated.View>

      <View style={[styles.top, { top: insets.top + 6 }]}>
        <SolidRound label="Voltar" onPress={() => router.back()}>
          <Icon name="back" size={18} color={INK} />
        </SolidRound>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SolidRound
            label={favorite ? 'Tirar dos salvos' : 'Salvar bar'}
            selected={favorite}
            onPress={toggleFavorite}
          >
            <Icon
              name="fan"
              size={19}
              color={favorite ? LIVE_RED : INK}
              accent={favorite ? LIVE_RED : INK}
            />
          </SolidRound>
          <SolidRound label="Compartilhar" onPress={share}>
            <Icon name="share" size={18} color={INK} />
          </SolidRound>
        </View>
      </View>

      {checkInDock && data?.checkIn && !mine?.code ? (
        <CheckInDockFor
          barId={id}
          eventId={data.checkIn.eventId}
          bottom={Math.max(insets.bottom, 12)}
        />
      ) : data && !games.length ? (
        <SaveDock
          bottom={Math.max(insets.bottom, 12)}
          saved={favorite}
          onPress={toggleFavorite}
        />
      ) : going && mine ? (
        <AttendDock
          game={going}
          now={now}
          attending={mine.attending}
          here={
            data?.checkIn?.done === true && data.checkIn.eventId === going.id
          }
          code={mine.code}
          bottom={Math.max(insets.bottom, 12)}
          onPress={attend}
          onCode={() =>
            router.push({
              pathname: '/codigo/[eventId]',
              params: { eventId: going.id }
            })
          }
        />
      ) : null}
      {soon.toast}
    </View>
  )
}

/** "sexta" → "sex", "Seg a qui" → "seg a qui": a semana curta do desenho. */
function shortDays(days: string) {
  const lower = days.toLocaleLowerCase('pt-BR')
  return /\s/.test(lower) ? lower : lower.slice(0, 3)
}

/**
 * Um comentário de "O que dizem" (2g): quem (ou "Anônimo"), o jogo e o mês,
 * o texto e as etiquetas. O quadrinho é acid para quem voltaria.
 */
function Review({
  review
}: {
  review: inferRouterOutputs<AppRouter>['pubs']['getById']['reviews'][number]
}) {
  const palette = usePalette()
  const date = new Date(review.startsAt)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Sao_Paulo'
    })
    .replace('.', '')
    .replace(' de ', ' ')
  return (
    <View
      style={[
        styles.quote,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Text style={[text(15, 'Regular', 1.45), { color: palette.ink }]}>
        “{review.comment}”
      </Text>
      <Text style={[styles.quoteBy, { color: palette.muted }]}>
        {[
          review.name ?? 'Anônimo',
          shortTitle(gameTitle(review)),
          date,
          review.stars ? `★ ${review.stars}` : null
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
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
      {/* No celular, o `h6` do redesign: Anton 26 em caixa alta. */}
      <Text
        style={[
          small
            ? text(15, 'Bold', 1.3)
            : { fontFamily: 'Anton', fontSize: 26, marginVertical: -6.3 },
          { color: palette.ink, flexShrink: 1 }
        ]}
      >
        {small ? title : title.toLocaleUpperCase('pt-BR')}
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
      {/* `.nx .e`: mono 11 em caixa alta. */}
      <Text
        style={{
          fontFamily: 'GeistMono-SemiBold',
          fontSize: 11,
          letterSpacing: 0.55,
          color: palette.ink
        }}
      >
        {children.toLocaleUpperCase('pt-BR')}
      </Text>
    </View>
  )
}

function RoundGlass({
  label,
  selected,
  size = 44,
  tone = 'dark',
  onPress,
  children
}: {
  label: string
  selected?: boolean
  size?: number
  tone?: 'light' | 'dark'
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
        tone={tone}
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
  // `.hero .info`: 20 dos lados, 22 do pé, 8 entre as linhas.
  heroText: { paddingHorizontal: 20, paddingBottom: 22 },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 22,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  // Anton 56: margem negativa no lugar do entrelinha curto.
  scoreBig: { fontFamily: 'Anton', fontSize: 56, marginVertical: -13.6 },
  scoreStars: { fontSize: 14, letterSpacing: 2, marginTop: 4 },
  scoreSmall: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, width: 12 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%' },
  vt: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  // Anton 40: margem negativa no lugar do entrelinha curto.
  vtBig: { fontFamily: 'Anton', fontSize: 40, marginVertical: -9.7 },
  quote: {
    borderRadius: 20,
    padding: 16,
    gap: 8,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  quoteBy: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  whereMap: { borderRadius: 20, overflow: 'hidden' },
  nearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18
  },
  whereButtons: { flexDirection: 'row', gap: 10 },
  routeButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  callButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hoursCard: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  monoBold: { fontFamily: 'GeistMono-Bold', fontSize: 13.5 },
  // `.lvband`: o selo vermelho do jogo ao vivo sobre a foto.
  liveBadge: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: LIVE_RED
  },
  liveBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: INK
  },
  liveBadgeText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.96,
    color: INK
  },
  eliteTag: {
    alignSelf: 'flex-start',
    backgroundColor: ACID,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 8
  },
  turn: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    marginTop: 6
  },
  name: {
    fontFamily: 'Anton',
    fontSize: 52,
    color: PAPER,
    marginVertical: -12.6
  },
  info: { color: '#c9c7c0', marginTop: 6 },
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
  nx: {
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  nxTime: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 19,
    marginVertical: -2.8
  },
  nxDay: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 5
  },
  amen: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 14 },
  amenItem: {
    width: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13
  },
  // Anton 22/1 do design, sem `lineHeight` (corta no iOS): margem negativa.
  when: {
    fontFamily: 'Anton',
    fontSize: 22,
    width: 62,
    marginVertical: -5.5,
    fontVariant: ['tabular-nums']
  },
  label: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  nota: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  notaBig: { fontFamily: 'Anton', fontSize: 72, marginVertical: -17.5 },
  pos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  posPill: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    justifyContent: 'center'
  },
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
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 110,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  stripName: { fontFamily: 'Anton', fontSize: 18, marginVertical: -4 },
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
  coverCut: { marginHorizontal: 14, alignSelf: 'stretch' },
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

/** O rodapé "Você está no bar?" com o check-in de verdade (rodada 8). */
function CheckInDockFor({
  barId,
  eventId,
  bottom
}: {
  barId: string
  eventId: string
  bottom: number
}) {
  const { phase, error, denied, run } = useCheckIn(barId, eventId)
  return (
    <CheckInDock
      bottom={bottom}
      phase={phase}
      error={error}
      denied={denied}
      onPress={run}
      onSettings={() => Linking.openSettings()}
    />
  )
}

/** O agora da página, de 30 em 30 s. */
function useClockNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
