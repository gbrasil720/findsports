import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'
import { Card, FilterChip } from '@/components/card'
import {
  matchLine,
  type Palette,
  Photo,
  usePalette
} from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { EASE, haptic, usePressScale } from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  Icon,
  LIVE,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import {
  distanceKm,
  formatKm,
  formatTime,
  isLive,
  searchCenter
} from '@/lib/explore'
import { nextGame, sortFavorites } from '@/lib/favorite-list'
import { useFavorites } from '@/lib/favorites'
import { trpc } from '@/lib/trpc'

/*
 * Favoritos (2m do design): os bares que o torcedor guardou, com o próximo
 * jogo de cada um. Ordem por próximo jogo ou por distância. O coração tira
 * o bar da lista; tocar no cartão abre a página do bar. O design tem um
 * terceiro filtro, "Com reserva", que saiu com a reserva de mesa.
 */

type Sort = 'game' | 'distance'
type FavoriteRow = inferRouterOutputs<AppRouter>['pubs']['getFavorites'][number]

// O cartão que sai desliza junto dos outros, que fecham o buraco.
const ROW_OUT = FadeOut.duration(160)
const ROW_MOVE = LinearTransition.duration(220).easing(EASE)

export default function Favorites() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  useStatusBar('auto')
  const list = useQuery(trpc.pubs.getFavorites.queryOptions())
  const favorites = useFavorites()
  const { device } = useExploreState()
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const from = searchCenter(device, city.data)
  const [sort, setSort] = useState<Sort>('game')
  const rows = sortFavorites(list.data ?? [], sort, from, distanceKm)
  const now = Date.now()

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 7, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => list.refetch()}
            tintColor={palette.muted}
          />
        }
      >
        <View style={styles.top}>
          <Title lines={[['Favoritos']]} size={40} color={palette.ink} />
          {rows.length ? (
            <Text style={[text(14), styles.count, { color: palette.muted }]}>
              {rows.length} {rows.length === 1 ? 'bar' : 'bares'}
            </Text>
          ) : null}
        </View>

        {list.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : list.isError ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir seus favoritos.
            </Text>
            <PillButton label="Tentar de novo" onPress={() => list.refetch()} />
          </View>
        ) : !rows.length ? (
          <View style={styles.empty}>
            <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
              Nenhum bar favorito ainda.
            </Text>
            <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
              Toque no coração de um bar, no mapa ou na página dele, para
              guardar aqui e ver os próximos jogos de lá.
            </Text>
            <PillButton
              label="Procurar bares"
              onPress={() => router.navigate('/explore')}
            />
          </View>
        ) : (
          <>
            <View style={styles.chips}>
              <FilterChip
                palette={palette}
                label="Próximo jogo"
                on={sort === 'game'}
                onPress={() => setSort('game')}
              />
              <FilterChip
                palette={palette}
                label="Distância"
                on={sort === 'distance'}
                onPress={() => setSort('distance')}
              />
            </View>
            {rows.map((row) => (
              <Animated.View
                key={row.barId}
                exiting={ROW_OUT}
                layout={ROW_MOVE}
              >
                <FavoriteCard
                  row={row}
                  palette={palette}
                  now={now}
                  km={
                    row.bar.latitude === null || row.bar.longitude === null
                      ? null
                      : distanceKm(from, {
                          lat: Number(row.bar.latitude),
                          lng: Number(row.bar.longitude)
                        })
                  }
                  onOpen={() => router.push(`/bar/${row.barId}` as Href)}
                  onUnfavorite={() => {
                    haptic.select()
                    favorites.toggle(row.barId)
                  }}
                />
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** "SÁB 16:00" fora de hoje; só a hora, hoje. */
function when(startsAt: string | Date, now: number) {
  const day = (d: number | string | Date) =>
    new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  if (day(startsAt) === day(now)) return formatTime(startsAt)
  const weekday = new Date(startsAt)
    .toLocaleDateString('pt-BR', {
      weekday: 'short',
      timeZone: 'America/Sao_Paulo'
    })
    .replace('.', '')
    .toLocaleUpperCase('pt-BR')
  return `${weekday} ${formatTime(startsAt)}`
}

function FavoriteCard({
  row,
  palette,
  now,
  km,
  onOpen,
  onUnfavorite
}: {
  row: FavoriteRow
  palette: Palette
  now: number
  km: number | null
  onOpen: () => void
  onUnfavorite: () => void
}) {
  const press = usePressScale()
  const game = nextGame(row)
  const live = game ? isLive(game, now) : false
  const place = [row.bar.neighborhood, km === null ? null : formatKm(km)]
    .filter(Boolean)
    .join(' · ')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.bar.name}, ${place}`}
      onPress={onOpen}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <Card
          palette={palette}
          shadow={live ? palette.liveShadow : undefined}
          offset={live ? 5 : 4}
          soft
        >
          <View style={styles.card}>
            <Photo
              uri={row.bar.photoUrl}
              name={row.bar.name}
              palette={palette}
              style={styles.photo}
            />
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text
                  style={[
                    text(17, 'Bold', 1.25),
                    styles.name,
                    { color: palette.ink }
                  ]}
                  numberOfLines={1}
                >
                  {row.bar.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tirar dos favoritos"
                  hitSlop={10}
                  onPress={onUnfavorite}
                >
                  <Icon
                    name="fan"
                    size={20}
                    color={palette.ink}
                    accent={palette.accent}
                  />
                </Pressable>
              </View>
              <Text
                style={[text(12.5), { color: palette.muted }]}
                numberOfLines={1}
              >
                {place}
              </Text>
              <Cut palette={palette} />
              {game ? (
                <View style={styles.game}>
                  {live ? (
                    <View style={styles.live}>
                      <View style={styles.dot}>
                        <View style={styles.halo} />
                      </View>
                      <Text
                        style={[text(12, 'Bold', 1.2), { color: palette.live }]}
                      >
                        Ao vivo
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.time, { color: palette.ink }]}>
                      {when(game.startsAt, now)}
                    </Text>
                  )}
                  <Text
                    style={[
                      text(13, 'Regular', 1.3),
                      styles.match,
                      { color: live ? palette.ink : palette.muted }
                    ]}
                    numberOfLines={1}
                  >
                    {matchLine(game)}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    text(13, 'Regular', 1.3),
                    styles.game,
                    { color: palette.muted }
                  ]}
                >
                  Sem jogo marcado
                </Text>
              )}
            </View>
          </View>
        </Card>
      </Animated.View>
    </Pressable>
  )
}

/**
 * O picote do ingresso, como no design: o tracejado no meio do texto e os
 * dois furos, um mordendo a foto e outro a borda do cartão.
 */
function Cut({ palette }: { palette: Palette }) {
  return (
    <View style={styles.cut}>
      <View style={[styles.hole, { left: -22, backgroundColor: palette.bg }]} />
      <Svg height={2} style={styles.dash}>
        <Line
          x1={0}
          y1={1}
          x2="100%"
          y2={1}
          stroke={palette.dash}
          strokeWidth={1.5}
          strokeDasharray="4.5,4.5"
        />
      </Svg>
      <View
        style={[styles.hole, { right: -20, backgroundColor: palette.bg }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end'
  },
  count: { paddingBottom: 6 },
  chips: { flexDirection: 'row', gap: 6 },
  empty: { gap: 16, marginTop: 24 },
  card: { flexDirection: 'row', gap: 12, padding: 10 },
  photo: { width: 84, height: 84, borderRadius: 3 },
  info: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8
  },
  name: { flex: 1 },
  cut: { height: 18, justifyContent: 'center' },
  hole: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9
  },
  dash: { marginHorizontal: 14 },
  game: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: LIVE
  },
  halo: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 8,
    backgroundColor: 'rgba(232,50,12,.22)'
  },
  time: { fontFamily: 'Anton', fontSize: 18, marginVertical: -4 },
  match: { flex: 1 }
})
