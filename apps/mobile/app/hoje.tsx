import {
  brasiliaDay,
  hasEventEnded,
  isEventLive
} from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useContext, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useExploreState } from '@/components/explore-state'
import { EASE } from '@/components/motion'
import { SplashDone } from '@/components/splash'
import { usePalette } from '@/components/theme'
import {
  ErrorState,
  Icon,
  PillButton,
  Text,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { SAO_PAULO } from '@/lib/explore'
import { leaveFirstOpen } from '@/lib/first-open'
import { trpc } from '@/lib/trpc'

/*
 * "O jogo de hoje" (rodada 1 do redesign, tela 2), no lugar das quatro páginas
 * da apresentação: os jogos reais de hoje na cidade, cada um com quantos
 * bares vão passar. Aparece só na primeira abertura, até a primeira escolha
 * (`lib/first-open.ts`). A localização só é pedida no toque em "Ver bares
 * perto de mim"; recusou, o Explorar abre na cidade.
 */

/** Raio da régua da cidade: o centro de São Paulo cobre a cidade em 25 km. */
const CITY_RADIUS_KM = 25
/** Linhas do placar; o resto vira "+ N jogos hoje". */
const SHOWN = 4
// Entrada em sequência das linhas (constantes de módulo: o Reanimated
// recomeça a entrada quando o objeto muda). 260 ms, 40 ms entre elas.
const ROW_IN = Array.from({ length: SHOWN + 1 }, (_, i) =>
  FadeInDown.duration(260)
    .easing(EASE)
    .delay(i * 40)
    .withInitialValues({ transform: [{ translateY: 8 }] })
)

const kickoff = (startsAt: string) =>
  new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })

export default function Today() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const splashDone = useContext(SplashDone)
  useStatusBar(palette.dark ? 'light' : 'dark')
  const { localCity, locate } = useExploreState()
  const center = localCity ?? SAO_PAULO
  const cityName = localCity?.name ?? 'São Paulo'
  const [now] = useState(() => new Date())
  const board = useQuery(
    trpc.pubs.gameBoard.queryOptions({
      lat: center.lat,
      lng: center.lng,
      radiusKm: CITY_RADIUS_KM,
      day: brasiliaDay(now)
    })
  )
  // Os que ainda não acabaram; os ao vivo primeiro, depois pela hora.
  const games = (board.data?.games ?? [])
    .filter((game) => !hasEventEnded(game, now))
    .map((game) => ({ ...game, live: isEventLive(game, now) }))
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) || a.startsAt.localeCompare(b.startsAt)
    )
  const red = palette.live

  const [locating, setLocating] = useState(false)
  const nearMe = async () => {
    setLocating(true)
    // O pedido do iOS sai aqui, quando a razão é óbvia. Recusou: o Explorar
    // abre na cidade.
    await Location.requestForegroundPermissionsAsync().catch(() => null)
    await locate()
    leaveFirstOpen()
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }
        ]}
      >
        <View style={styles.top}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel="Onside"
            style={styles.mark}
          >
            <View style={[styles.ring, { borderColor: palette.ink }]} />
            <View style={[styles.ball, { backgroundColor: palette.live }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.push('/entrar')}
          >
            <Text
              style={[
                text(15, 'SemiBold'),
                { color: palette.ink, textDecorationLine: 'underline' }
              ]}
            >
              Entrar
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 30 }}>
          <Title
            lines={[['Onde vai ser'], ['', 'o jogo?']]}
            size={56}
            color={palette.ink}
            accentColor={red}
          />
        </View>
        <Text
          style={[
            text(16.5, 'Regular', 1.45),
            { color: palette.muted, marginTop: 12, maxWidth: 320 }
          ]}
        >
          Os jogos de hoje em {cityName} e quantos bares vão passar cada um.
        </Text>

        {board.isError ? (
          <ErrorState
            title="Não deu para ver os jogos de hoje."
            error={board.error}
            onRetry={() => board.refetch()}
            retrying={board.isFetching}
            style={{ marginTop: 22 }}
          />
        ) : !board.data || !splashDone ? (
          // Sem esqueleto: a resposta chega durante a splash quase sempre.
          <View style={{ height: 22 }} />
        ) : games.length === 0 ? (
          <Animated.View
            entering={ROW_IN[0]}
            style={[
              styles.board,
              styles.empty,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Text style={[text(16, 'Bold', 1.2), { color: palette.ink }]}>
              Nenhum jogo marcado hoje em {cityName}
            </Text>
            <Text style={[text(13.5), { color: palette.muted, marginTop: 4 }]}>
              Veja os bares perto de você e quando eles passam o próximo.
            </Text>
          </Animated.View>
        ) : (
          <View
            style={[
              styles.board,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {games.slice(0, SHOWN).map((game, i) => (
              <Animated.View key={game.key} entering={ROW_IN[i]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${game.title}, ${game.live ? 'ao vivo' : `hoje às ${kickoff(game.startsAt)}`}, ${game.bars.length} ${game.bars.length === 1 ? 'bar' : 'bares'}`}
                  onPress={() => leaveFirstOpen({ jogo: game.key })}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: palette.line
                    },
                    pressed && { backgroundColor: palette.mark }
                  ]}
                >
                  <View style={styles.time}>
                    <Text
                      style={[
                        styles.clock,
                        { color: game.live ? red : palette.ink }
                      ]}
                    >
                      {kickoff(game.startsAt)}
                    </Text>
                    <Text style={[styles.when, { color: palette.muted }]}>
                      {game.live ? 'AO VIVO' : 'HOJE'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={2}
                      style={[text(16, 'Bold', 1.2), { color: palette.ink }]}
                    >
                      {game.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        text(13.5),
                        { color: palette.muted, marginTop: 2 }
                      ]}
                    >
                      {game.championship} · {game.bars.length}{' '}
                      {game.bars.length === 1 ? 'bar' : 'bares'}
                    </Text>
                  </View>
                  <Icon name="next" size={18} color={palette.muted} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
        {splashDone && games.length > SHOWN ? (
          <Animated.View entering={ROW_IN[SHOWN]}>
            <Text style={[styles.more, { color: palette.muted }]}>
              + {games.length - SHOWN}{' '}
              {games.length - SHOWN === 1 ? 'jogo' : 'jogos'} hoje
            </Text>
          </Animated.View>
        ) : null}

        <View style={styles.cta}>
          <PillButton
            label={locating ? 'Procurando você…' : 'Ver bares perto de mim'}
            leading="pin"
            busy={locating}
            onPress={nearMe}
          />
          <View style={styles.alt}>
            <Text style={[text(14.5), { color: palette.muted }]}>ou</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() =>
                router.push({ pathname: '/cidade', params: { de: 'hoje' } })
              }
            >
              <Text
                style={[
                  text(14.5, 'SemiBold'),
                  { color: palette.ink, textDecorationLine: 'underline' }
                ]}
              >
                escolher a cidade
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  mark: { width: 26, height: 26 },
  ring: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4
  },
  ball: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5
  },
  board: {
    marginTop: 22,
    borderRadius: 24,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0
  },
  empty: { paddingHorizontal: 18, paddingVertical: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  time: { width: 62 },
  // A Geist Mono tem 1,3em de altura natural: sem `lineHeight` menor.
  clock: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 17,
    fontVariant: ['tabular-nums']
  },
  when: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.6,
    marginTop: 2
  },
  more: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 10
  },
  cta: { marginTop: 'auto', paddingTop: 28, gap: 10 },
  alt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4
  }
})
