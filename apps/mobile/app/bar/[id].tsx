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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  dayLabel,
  MatchRow,
  matchLine,
  type Palette,
  PhotoPill,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { haptic } from '@/components/motion'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { trackCommercialEvent } from '@/lib/commercial'
import { env } from '@/lib/env'
import { formatKm, formatTime, isLive } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * "Bar · página" (07 do design): foto, nome, o jogo de hoje, o que o bar tem
 * para ver o jogo, a oferta da casa e "Vou assistir". A reserva de mesa é a
 * seção 08 e entra com ela.
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
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
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
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {data.plan === 'elite' ? (
                <PhotoPill kind="elite" label="Elite" />
              ) : null}
              {data.rating ? (
                <PhotoPill
                  kind="glass"
                  label={`${data.rating.percentage}% voltariam`}
                />
              ) : null}
            </View>
            <Text style={styles.name} numberOfLines={3}>
              {data.name.toUpperCase()}
            </Text>
            <Text style={[text(14), { color: '#e2dfd7', marginTop: 4 }]}>
              {info.join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {next ? (
            <>
              <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
                {isLive(next, now) || dayLabel(next.startsAt, now) === 'Hoje'
                  ? 'Hoje no telão'
                  : 'Próximo jogo'}
              </Text>
              <GameCard game={next} now={now} palette={palette} />
            </>
          ) : (
            <Text style={[text(15), { color: palette.muted }]}>
              Nenhum jogo marcado por enquanto.
            </Text>
          )}

          {tiles.length ? (
            <View style={styles.tiles}>
              {tiles.map((tile) => (
                <View
                  key={tile.id}
                  style={[styles.tile, { backgroundColor: palette.card }]}
                >
                  <Icon name={tile.icon} size={26} color={palette.ink} />
                  <Text
                    style={[
                      text(11.5, 'SemiBold', 1.2),
                      { color: palette.ink }
                    ]}
                  >
                    {tile.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {others.length ? (
            <Text style={[text(13), { color: palette.muted }]}>
              Também: {others.map((item) => item.label).join(', ')}.
            </Text>
          ) : null}

          {data.houseOffer ? (
            <View style={[styles.offer, { backgroundColor: palette.card }]}>
              <View style={styles.offerStub}>
                <Icon name="ticket" size={26} color={INK} />
              </View>
              <View
                style={{ flex: 1, padding: 12, paddingHorizontal: 14, gap: 2 }}
              >
                <Text style={[text(14.5, 'Bold'), { color: palette.ink }]}>
                  Oferta da casa
                </Text>
                <Text style={[text(13), { color: palette.muted }]}>
                  {data.houseOffer}
                </Text>
              </View>
            </View>
          ) : null}

          {games.length > 1 ? (
            <View style={{ gap: 8 }}>
              <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
                Outros jogos
              </Text>
              {games.slice(1).map((game) => (
                <View
                  key={game.id}
                  style={[styles.other, { borderColor: palette.line }]}
                >
                  <Text
                    style={[
                      text(14, 'SemiBold'),
                      { color: palette.ink, flex: 1 }
                    ]}
                    numberOfLines={1}
                  >
                    {matchLine(game)}
                  </Text>
                  <Text style={[text(13), { color: palette.muted }]}>
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
            <Icon name="fan" size={20} color={PAPER} />
          </RoundGlass>
        </View>
      </View>

      {going && mine ? (
        <Glass
          tone="light"
          style={[styles.dock, { bottom: insets.bottom + 12 }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mine.attending }}
            disabled={attend.isPending}
            onPress={() =>
              attend.mutate({
                eventId: going.id,
                attending: !mine.attending
              })
            }
            style={({ pressed }) => [
              styles.attend,
              mine.attending && { backgroundColor: ACID },
              pressed && { transform: [{ scale: 0.97 }] }
            ]}
          >
            <Icon name={mine.attending ? 'check' : 'people'} size={19} />
            <View>
              <Text style={[text(15, 'Bold', 1.2), { color: INK }]}>
                {mine.attending ? 'Vou assistir aqui' : 'Vou assistir'}
                {mine.count ? (
                  <Text style={[text(13, 'SemiBold'), { color: '#55554f' }]}>
                    {' '}
                    · {mine.count} vão
                  </Text>
                ) : null}
              </Text>
              {/* Vale para o próximo jogo que não começou: diz qual. */}
              <Text
                style={[text(12, 'Regular', 1.2), { color: '#55554f' }]}
                numberOfLines={1}
              >
                {matchLine(going)},{' '}
                {dayLabel(going.startsAt, now).toLowerCase()} às{' '}
                {formatTime(going.startsAt)}
              </Text>
            </View>
          </Pressable>
        </Glass>
      ) : null}
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
      {selected ? (
        <View style={[styles.round, { backgroundColor: LIVE }]}>
          {children}
        </View>
      ) : (
        <Glass tone="dark" interactive style={styles.round}>
          {children}
        </Glass>
      )}
    </Pressable>
  )
}

/** O jogo de hoje (ou o próximo): times, estado e quando. */
function GameCard({
  game,
  now,
  palette
}: {
  game: Parameters<typeof MatchRow>[0]['game']
  now: number
  palette: Palette
}) {
  const live = isLive(game, now)
  return (
    <View>
      <View
        style={[
          styles.cardShadow,
          live && { backgroundColor: 'rgba(232,50,12,.28)' }
        ]}
      />
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <MatchRow game={game} now={now} palette={palette} />
        <Text style={[text(12.5), styles.cardFoot, { color: palette.muted }]}>
          {live
            ? 'Rolando agora'
            : `${dayLabel(game.startsAt, now)}, ${formatTime(game.startsAt)}`}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  hero: { height: 340, backgroundColor: '#2a2a25', justifyContent: 'flex-end' },
  heroText: { padding: 18 },
  name: {
    fontFamily: 'Anton',
    fontSize: 52,
    color: PAPER,
    letterSpacing: -1,
    marginVertical: -12
  },
  body: { padding: 16, gap: 14 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    paddingTop: 11,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18,18,15,.12)'
  },
  offer: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18,18,15,.12)'
  },
  offerStub: {
    width: 62,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(18,18,15,.25)',
    borderStyle: 'dashed'
  },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
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
    padding: 9,
    overflow: 'hidden'
  },
  attend: {
    flex: 1,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,.55)'
  },
  card: {
    borderRadius: 6,
    overflow: 'hidden',
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18,18,15,.12)'
  },
  cardShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 6,
    backgroundColor: 'rgba(18,18,15,.09)'
  },
  cardFoot: { paddingHorizontal: 14, paddingTop: 10 }
})
