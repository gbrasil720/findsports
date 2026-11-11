import {
  brasiliaDay,
  hasEventEnded,
  isEventLive
} from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useExploreState } from '@/components/explore-state'
import { usePressScale } from '@/components/motion'
import { ACID, INK, PAPER, PillButton, Text, text } from '@/components/ui'
import { formatTime, SAO_PAULO } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * 404 (rodada 7, 06): "Lance impedido" sobre o telão de LED apagado. O erro
 * vira placar ("Você 4 · 0 · 4 a página") e a bandeira do bandeirinha fica
 * levantada. Em vez de um beco, os jogos de agora: o ao vivo e o próximo,
 * cada um abrindo o Explorar com o jogo escolhido. Nada anima: erro não é
 * lugar de festa. Escuro nos dois temas, como o telão.
 */

const GREY = '#aaa9a4'
const LIVE_TEXT = '#f3421d'
const CITY_RADIUS_KM = 25

export default function NotFound() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { localCity, device } = useExploreState()
  const center = device ?? localCity ?? SAO_PAULO
  const [now] = useState(() => new Date())
  const board = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({
      lat: center.lat,
      lng: center.lng,
      radiusKm: CITY_RADIUS_KM,
      day: brasiliaDay(now)
    }),
    retry: false
  })
  // O ao vivo e o próximo: os dois primeiros que ainda não acabaram.
  const games = (board.data?.games ?? [])
    .filter((game) => !hasEventEnded(game, now))
    .map((game) => ({ ...game, live: isEventLive(game, now) }))
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) || a.startsAt.localeCompare(b.startsAt)
    )
    .slice(0, 2)

  useEffect(() => {
    setStatusBarStyle('light')
    return () => setStatusBarStyle('auto')
  }, [])

  const explore = (jogo?: string) =>
    router.replace({
      pathname: '/explore',
      params: jogo ? { jogo } : {}
    } as Href)

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={require('@/assets/images/splash/led.webp')}
          style={[StyleSheet.absoluteFill, { opacity: 0.22 }]}
          resizeMode="cover"
        />
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="apaga404" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.04" stopColor={INK} stopOpacity={1} />
              <Stop offset="0.3" stopColor={INK} stopOpacity={0.55} />
              <Stop offset="0.6" stopColor={INK} stopOpacity={0.7} />
              <Stop offset="0.92" stopColor={INK} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#apaga404)" />
        </Svg>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + 14,
            paddingBottom: Math.max(insets.bottom, 16) + 18
          }
        ]}
        bounces={false}
      >
        <View
          style={styles.board}
          accessible
          accessibilityLabel="Erro 404: esta página não existe"
        >
          <View style={styles.side}>
            <Text style={styles.small}>VOCÊ</Text>
            <Text style={styles.big}>4</Text>
          </View>
          <View style={styles.mid}>
            <Text style={styles.zero}>0</Text>
            <Text style={styles.small}>ERRO</Text>
          </View>
          <View style={styles.side}>
            <Text style={styles.small}>A PÁGINA</Text>
            <Text style={styles.big}>4</Text>
          </View>
        </View>

        <View style={styles.flag}>
          <Svg width={46} height={48} viewBox="0 0 46 48">
            {/* O mastro e o pano do bandeirinha: metade acid na diagonal. */}
            <Path
              d="M6 4v42"
              stroke={PAPER}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <Path d="M9 6h31v22H9z" fill={INK} stroke={PAPER} strokeWidth={2} />
            <Path d="M10 27L39 7v20z" fill={ACID} />
          </Svg>
        </View>

        <View accessible accessibilityRole="header" style={styles.titleBox}>
          <Text style={[styles.title, { color: PAPER }]}>Lance</Text>
          <Text style={[styles.title, { color: ACID }]}>impedido</Text>
        </View>
        <Text style={[text(14.5, 'Regular', 1.45), styles.lead]}>
          Essa página não existe ou saiu do ar.
          {games.length ? ' O jogo continua por aqui:' : ''}
        </Text>

        {games.length ? (
          <View style={styles.games}>
            {games.map((game) => (
              <GameRow
                key={game.key ?? game.title}
                time={formatTime(game.startsAt)}
                live={game.live}
                title={game.title}
                sub={`${game.live ? 'ao vivo' : 'hoje'} · ${game.bars.length} ${game.bars.length === 1 ? 'bar' : 'bares'}`}
                onPress={() => explore(game.key ?? undefined)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.foot}>
          <View style={{ alignSelf: 'stretch' }}>
            <PillButton label="Voltar ao Explorar" onPress={() => explore()} />
          </View>
          <Text
            accessibilityRole="link"
            onPress={() => router.replace('/busca' as Href)}
            suppressHighlighting
            style={[text(13, 'Bold', 1.4), styles.search]}
          >
            Buscar um bar ou time
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function GameRow({
  time,
  live,
  title,
  sub,
  onPress
}: {
  time: string
  live: boolean
  title: string
  sub: string
  onPress: () => void
}) {
  const press = usePressScale(0.98)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.game}
    >
      <Text style={[styles.time, live && { color: LIVE_TEXT }]}>{time}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(14.5, 'Bold', 1.25), { color: PAPER }]}
        >
          {title}
        </Text>
        <Text style={styles.gameSub}>{sub}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  body: { flexGrow: 1, paddingHorizontal: 18, alignItems: 'center', gap: 12 },
  board: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1c1c18',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.08)',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  side: { flex: 1, gap: 4, alignItems: 'center' },
  mid: { alignItems: 'center', gap: 2 },
  small: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: GREY
  },
  big: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 44,
    color: ACID,
    textShadowColor: 'rgba(201,241,53,.45)',
    textShadowRadius: 16
  },
  zero: { fontFamily: 'GeistMono-SemiBold', fontSize: 30, color: LIVE_TEXT },
  flag: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginTop: 4,
    backgroundColor: '#1c1c18',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleBox: { alignItems: 'center', marginVertical: 6 },
  // Anton 56 a .92: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 56,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginVertical: -16
  },
  lead: { color: GREY, textAlign: 'center', maxWidth: 290 },
  games: { alignSelf: 'stretch', gap: 8 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(28,28,24,.92)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.08)'
  },
  time: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 17,
    color: PAPER,
    minWidth: 50
  },
  gameSub: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: GREY,
    marginTop: 2
  },
  foot: { alignSelf: 'stretch', gap: 14, marginTop: 6, alignItems: 'center' },
  search: { color: PAPER, textDecorationLine: 'underline' }
})
