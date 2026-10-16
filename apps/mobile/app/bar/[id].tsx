import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams } from 'expo-router'
import { type ReactNode, useEffect } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BarTicket,
  dayLabel,
  matchLine,
  type Palette,
  PhotoPill,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { haptic, usePress } from '@/components/motion'
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
import { trpc } from '@/lib/trpc'

/*
 * "Página do bar" (2g do design): a foto com o nome, o jogo de hoje no mesmo
 * ingresso do Explorar, o que o bar tem para ver o jogo, a oferta da casa e a
 * dupla "Vou assistir" e "Reservar mesa" num vidro preso embaixo. A reserva é
 * a seção 08: até lá o botão avisa que chega em breve.
 */

/** As características que o design desenha em ladrilho, com ícone. */
const TILES = [
  { id: 1, icon: 'tv', label: 'Telão' },
  { id: 2, icon: 'sound', label: 'Som ligado' },
  { id: 3, icon: 'premiere', label: 'Premiere' },
  { id: 4, icon: 'outdoor', label: 'Área externa' }
] as const

export default function BarPage() {
  const { id, km } = useLocalSearchParams<{ id: string; km?: string }>()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const soon = useSoon()
  const reserve = usePress(0, 3)
  useStatusBar('light')

  const bar = useQuery(trpc.pubs.getById.queryOptions({ id }))
  const favorites = useQuery(trpc.pubs.getFavorites.queryOptions())
  const favorite = favorites.data?.some((item) => item.barId === id) ?? false

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
  const attend = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: () => {
        haptic.success()
        return queryClient.invalidateQueries({
          queryKey: trpc.pubs.getById.queryKey({ id })
        })
      },
      onError: () => haptic.error()
    })
  )

  // Uma visita por abertura da página, só depois de ela existir.
  const loaded = bar.isSuccess
  const fan = session.data?.user.role === 'fan'
  useEffect(() => {
    if (loaded && fan) trackCommercialEvent({ pubId: id, type: 'profile_view' })
  }, [loaded, fan, id])

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
  const others = AMENITIES.filter(
    (item) =>
      data.amenities.includes(item.id) &&
      !TILES.some((tile) => tile.id === item.id)
  )
  const reservable = games.some((game) => game.acceptsReservations)

  const toggleFavorite = () => {
    haptic.select()
    if (favorite) removeFavorite.mutate({ barId: id })
    else addFavorite.mutate({ barId: id })
  }
  const share = () =>
    Share.share({
      message: `${data.name} na Onside: ${env.EXPO_PUBLIC_SERVER_URL}/pub/${id}`
    })

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {data.photoUrl ? (
            <Image
              source={{ uri: data.photoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          <LinearGradient
            colors={[
              'rgba(18,18,15,.3)',
              'rgba(18,18,15,0)',
              'rgba(18,18,15,.82)'
            ]}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <View style={styles.heroPills}>
              {data.plan === 'elite' ? (
                <PhotoPill kind="acid" height={32}>
                  <Icon name="medal" size={15} color={INK} />
                  <Text style={[text(13.5, 'Bold', 1.2), { color: INK }]}>
                    Elite
                  </Text>
                </PhotoPill>
              ) : null}
              {data.rating ? (
                <PhotoPill kind="dark" height={32}>
                  <Text style={[text(13.5, 'Bold', 1.2), { color: PAPER }]}>
                    {data.rating.percentage}% voltariam
                  </Text>
                </PhotoPill>
              ) : null}
            </View>
            <Text style={styles.name} numberOfLines={3}>
              {data.name.toUpperCase()}
            </Text>
            <Text style={[text(14, 'Regular', 1.4), styles.info]}>
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
                  distance_km: km ? Number(km) : 0,
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
          {others.length ? (
            <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
              Também: {others.map((item) => item.label).join(', ')}.
            </Text>
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
            <View style={{ gap: 4 }}>
              <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
                Outros jogos
              </Text>
              {games.slice(1).map((game) => (
                <View
                  key={game.id}
                  style={[styles.other, { borderColor: palette.line }]}
                >
                  <Text
                    style={[
                      text(14, 'SemiBold', 1.3),
                      { color: palette.ink, flex: 1 }
                    ]}
                    numberOfLines={1}
                  >
                    {matchLine(game)}
                  </Text>
                  <Text style={[styles.otherWhen, { color: palette.muted }]}>
                    {dayLabel(game.startsAt, now)} · {formatTime(game.startsAt)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

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
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mine.attending }}
              accessibilityHint={`${matchLine(going)}, ${dayLabel(going.startsAt, now).toLowerCase()} às ${formatTime(going.startsAt)}`}
              disabled={attend.isPending}
              onPress={() =>
                attend.mutate({ eventId: going.id, attending: !mine.attending })
              }
              style={({ pressed }) => [
                styles.attend,
                palette.dark && styles.attendDark,
                mine.attending && { backgroundColor: ACID },
                !reservable && { flex: 1 },
                pressed && { transform: [{ scale: 0.97 }] }
              ]}
            >
              <Icon
                name={mine.attending ? 'check' : 'people'}
                size={19}
                color={mine.attending ? INK : palette.ink}
                accent={palette.accent}
              />
              <Text
                style={[
                  text(15, 'Bold', 1.2),
                  { color: mine.attending ? INK : palette.ink }
                ]}
              >
                {mine.attending ? 'Vou assistir aqui' : 'Vou assistir'}
              </Text>
            </Pressable>
          ) : null}
          {reservable ? (
            <Pressable
              accessibilityRole="button"
              onPressIn={reserve.onPressIn}
              onPressOut={reserve.onPressOut}
              onPress={() => soon.show('A reserva de mesa')}
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

/** Cartão do design: fundo, contorno de 1 px e sombra dura deslocada. */
function Card({
  palette,
  shadow,
  offset = 4,
  style,
  children
}: {
  palette: Palette
  shadow?: string
  offset?: number
  style?: object
  children: ReactNode
}) {
  return (
    <View style={style && { flex: 1 }}>
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
  hero: { height: 340, backgroundColor: '#2a2a25', justifyContent: 'flex-end' },
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
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  otherWhen: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
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
  attend: {
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
