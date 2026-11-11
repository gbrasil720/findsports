import { maintenanceForecast } from '@findsports_oficial/api/lib/maintenance-forecast'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { haptic, usePressScale } from '@/components/motion'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  PAPER,
  Text,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import {
  type Maintenance,
  readTodayCode,
  useKeepTodayCode,
  useMaintenance
} from '@/lib/maintenance'
import { shortTitle, tickerItem } from '@/lib/maintenance-ticker'
import { trpc } from '@/lib/trpc'

/*
 * "Intervalo técnico" (rodada 7, 26d; WEB-466): a manutenção que o Houdini
 * liga. Cobre o app inteiro, por cima das telas. Ao fundo, o telão de LED da
 * splash, parado e apagado (a tela pode ficar aberta muito tempo); no topo, a
 * faixa de placar com os jogos de hoje correndo, como no estádio. O relógio
 * da previsão em dígitos de placar, o quadro do que segue funcionando e o
 * ingresso guardado no aparelho, com "Abrir meu código": quem está no balcão
 * não fica sem ele. Só o app muda: painel do bar e login seguem no ar. Quando
 * a manutenção acaba, a tela sai sozinha.
 */

const GREY = '#aaa9a4'
const LINE = '#34342d'
/** A faixa de placar anda a 40 pt/s (os quatro jogos do desenho: ~18 s). */
const SPEED = 40

/** O telão de LED da splash, parado, com o degradê que o apaga. */
function LedBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('@/assets/images/splash/led.webp')}
        style={[StyleSheet.absoluteFill, { opacity: 0.32 }]}
        resizeMode="cover"
      />
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="apaga" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.04" stopColor={INK} stopOpacity={1} />
            <Stop offset="0.3" stopColor={INK} stopOpacity={0.55} />
            <Stop offset="0.6" stopColor={INK} stopOpacity={0.7} />
            <Stop offset="0.92" stopColor={INK} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#apaga)" />
      </Svg>
    </View>
  )
}

/**
 * A faixa de placar: os jogos de hoje correndo da direita para a esquerda,
 * constante (linear, 40 pt/s: com os quatro jogos do desenho, ~18 s por
 * volta). Só corre à vista: para sob o código aberto por cima e com o app em
 * segundo plano. Movimento reduzido: parada.
 */
function Ticker() {
  const reduced = useReducedMotion()
  const pathname = usePathname()
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) =>
      setActive(state === 'active')
    )
    return () => sub.remove()
  }, [])
  const visible = active && !pathname.startsWith('/codigo')
  const games = useQuery({
    ...trpc.pubs.todayGames.queryOptions(),
    retry: false
  })
  const items = (games.data ?? []).map((game) => tickerItem(game, formatTime))
  const [box, setBox] = useState(0)
  const [width, setWidth] = useState(0)
  // Com poucos jogos, a lista se repete até cobrir a faixa: sem buraco.
  const repeat = width && box ? Math.max(1, Math.ceil(box / width)) : 1
  const x = useSharedValue(0)
  useEffect(() => {
    if (reduced || !width || !visible) {
      cancelAnimation(x)
      return
    }
    const lap = width * repeat
    x.set(0)
    x.set(
      withRepeat(
        withTiming(-lap, {
          duration: (lap / SPEED) * 1000,
          easing: Easing.linear
        }),
        -1
      )
    )
    return () => cancelAnimation(x)
  }, [reduced, width, repeat, visible, x])
  const run = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))
  if (!items.length) return <View style={{ height: 8 }} />
  // Duas voltas seguidas: quando a primeira sai inteira, volta sem salto.
  const strip = (copy: string, measure: boolean) => (
    <View
      key={copy}
      style={styles.strip}
      onLayout={
        measure ? (e) => setWidth(e.nativeEvent.layout.width) : undefined
      }
    >
      {items.map((item, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: dois jogos podem ter o mesmo texto
          key={`${copy}${index}`}
          style={styles.tickItem}
        >
          <Text maxFontSizeMultiplier={1} style={styles.tickText}>
            {item}
          </Text>
          <Text maxFontSizeMultiplier={1} style={styles.tickDot}>
            ●
          </Text>
        </View>
      ))}
    </View>
  )
  const laps = Array.from({ length: repeat * 2 }, (_, n) => `v${n}`)
  return (
    <View
      style={styles.ticker}
      onLayout={(e) => setBox(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Jogos de hoje: ${items.join(', ')}`}
    >
      <Animated.View style={[styles.tickRow, run]}>
        {laps.map((copy, n) => strip(copy, n === 0))}
      </Animated.View>
    </View>
  )
}

/**
 * O ponto de "voltando": pisca devagar (1,4 s a volta) por uns 30 s e para
 * aceso; reduzido, parado.
 */
function Waiting() {
  const reduced = useReducedMotion()
  const fade = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    fade.set(
      withRepeat(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        // ~30 s e para aceso: a tela pode ficar aberta muito tempo.
        42,
        true
      )
    )
    return () => cancelAnimation(fade)
  }, [reduced, fade])
  const style = useAnimatedStyle(() => ({ opacity: fade.get() }))
  return (
    <Animated.View style={[styles.dot, { backgroundColor: GREY }, style]} />
  )
}

/** A marca pequena do ingresso (`.mk3`): anel de tinta e o ponto vermelho. */
function Mark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markRing} />
      <View style={styles.markDot} />
    </View>
  )
}

/** Relógio que anda de 15 em 15 s: a previsão some quando passa da hora. */
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const STATUS: [string, string, boolean][] = [
  ['Seu código do balcão', 'valendo', true],
  ['Painel dos bares', 'no ar', true],
  ['App da Onside', 'voltando', false]
]

export function MaintenanceScreen({
  maintenance
}: {
  maintenance: Maintenance
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const press = usePressScale(0.97)
  const now = useNow()
  const userId = authClient.useSession().data?.user.id
  const forecast = maintenanceForecast(maintenance.backAt, now)
  const code = readTodayCode(userId, now)

  useEffect(() => {
    setStatusBarStyle('light')
    return () => setStatusBarStyle('auto')
  }, [])

  return (
    <View style={styles.screen}>
      <LedBackdrop />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top - 4,
            paddingBottom: Math.max(insets.bottom, 16) + 18
          }
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Ticker />
        <Text style={styles.eyebrow}>INTERVALO TÉCNICO</Text>
        <View accessible accessibilityRole="header" style={styles.titleBox}>
          <Text style={[styles.title, { color: PAPER }]}>Já já</Text>
          <Text style={[styles.title, { color: ACID }]}>volta o jogo</Text>
        </View>
        {forecast ? (
          <>
            {/* A previsão em dígitos de placar; troca seca se o servidor mudar. */}
            <View
              style={styles.score}
              accessible
              accessibilityLabel={`Previsão de volta ${forecast.time}`}
            >
              {forecast.time.split('').map((char, index) =>
                char === ':' ? (
                  <Text
                    // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa do relógio
                    key={index}
                    maxFontSizeMultiplier={1}
                    style={styles.colon}
                  >
                    :
                  </Text>
                ) : (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa do relógio
                    key={index}
                    style={styles.key}
                  >
                    <Text maxFontSizeMultiplier={1} style={styles.keyText}>
                      {char}
                    </Text>
                  </View>
                )
              )}
            </View>
            <Text style={[text(12.5), { color: GREY }]}>
              previsão de volta · hoje
            </Text>
          </>
        ) : (
          <Text style={[text(15, 'Regular', 1.45), styles.lead]}>
            Estamos fazendo uma manutenção no app. Avisamos aqui quando voltar.
          </Text>
        )}

        <View style={styles.status}>
          {STATUS.map(([label, value, ok], index) => (
            <View
              key={label}
              style={[styles.statusRow, index > 0 && styles.statusLine]}
            >
              {ok ? (
                <View style={[styles.dot, { backgroundColor: ACID }]} />
              ) : (
                <Waiting />
              )}
              <Text style={[text(13.5, 'SemiBold', 1.2), { color: PAPER }]}>
                {label}
              </Text>
              <Text style={styles.statusValue}>{value}</Text>
            </View>
          ))}
        </View>

        {code ? (
          <>
            <View style={styles.ticket}>
              <View style={styles.ticketTop}>
                <View style={styles.ticketBrand}>
                  <Mark />
                  <Text style={styles.ticketLogo}>ONSIDE</Text>
                  <Text style={styles.ticketKicker}>CÓDIGO DO BALCÃO</Text>
                </View>
                <View style={styles.saved}>
                  <Text style={styles.savedText}>guardado</Text>
                </View>
              </View>
              <View style={styles.ticketBottom}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={[text(15, 'Bold', 1.25), { color: INK }]}
                  >
                    {code.barName}
                  </Text>
                  <Text numberOfLines={1} style={styles.ticketLine}>
                    {shortTitle(gameTitle(code))} · hoje{' '}
                    {formatTime(code.startsAt)}
                  </Text>
                </View>
                <Text style={styles.code}>{code.code}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPressIn={press.onPressIn}
              onPressOut={press.onPressOut}
              onPress={() =>
                router.push({
                  pathname: '/codigo/[eventId]',
                  params: { eventId: code.eventId }
                })
              }
              style={{ alignSelf: 'stretch' }}
            >
              <Animated.View style={[styles.button, press.style]}>
                <Icon name="qr" size={20} color={INK} accent={INK} />
                <Text
                  maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
                  numberOfLines={1}
                  style={[text(16, 'Bold'), { color: INK }]}
                >
                  Abrir meu código
                </Text>
              </Animated.View>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

const SCREEN_IN = FadeIn.duration(200)
const SCREEN_OUT = FadeOut.duration(160)

/**
 * A manutenção por cima do app, montada na raiz. Também guarda o código do
 * jogo de hoje no aparelho, para ela (e a falta de rede) abrirem.
 */
export function MaintenanceGate() {
  useKeepTodayCode()
  const maintenance = useMaintenance()
  const on = maintenance?.on === true
  const was = useRef(on)

  useEffect(() => {
    // Voltou: a tela sai e o toque confirma.
    if (was.current && !on) haptic.success()
    was.current = on
  }, [on])

  if (!maintenance || !on) return null
  return (
    <Animated.View
      entering={SCREEN_IN}
      exiting={SCREEN_OUT}
      accessibilityViewIsModal
      style={StyleSheet.absoluteFill}
    >
      <MaintenanceScreen maintenance={maintenance} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK, overflow: 'hidden' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 12
  },
  ticker: {
    alignSelf: 'stretch',
    marginHorizontal: -18,
    marginBottom: 4,
    overflow: 'hidden',
    backgroundColor: '#1c1c18',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingVertical: 8
  },
  tickRow: { flexDirection: 'row' },
  strip: { flexDirection: 'row' },
  tickItem: { flexDirection: 'row', alignItems: 'center' },
  tickText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.7,
    color: ACID,
    marginHorizontal: 7
  },
  tickDot: { fontSize: 8, color: '#f3421d', marginHorizontal: 7 },
  eyebrow: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.68,
    color: ACID
  },
  titleBox: { alignItems: 'center', marginVertical: 6 },
  // Anton 54 a .92: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 54,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginVertical: -15.4
  },
  lead: { color: GREY, textAlign: 'center', maxWidth: 300 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  key: {
    width: 52,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1c1c18',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  keyText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 44,
    color: ACID,
    textShadowColor: 'rgba(201,241,53,.5)',
    textShadowRadius: 16
  },
  colon: { fontFamily: 'GeistMono-SemiBold', fontSize: 40, color: ACID },
  status: {
    alignSelf: 'stretch',
    borderRadius: 18,
    backgroundColor: 'rgba(28,28,24,.9)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.08)',
    paddingVertical: 4,
    paddingHorizontal: 14
  },
  statusRow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  statusLine: { borderTopWidth: 1, borderTopColor: LINE },
  statusValue: {
    marginLeft: 'auto',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    color: GREY
  },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  ticket: {
    alignSelf: 'stretch',
    backgroundColor: PAPER,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  ticketBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticketLogo: { fontFamily: 'Anton', fontSize: 14, color: INK },
  ticketKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: '#55554f'
  },
  saved: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: INK
  },
  savedText: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5, color: ACID },
  ticketBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderTopColor: '#d9d4c8',
    paddingTop: 8
  },
  ticketLine: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    color: '#55554f'
  },
  // Anton 30: margem negativa no lugar do entrelinha curto.
  code: {
    fontFamily: 'Anton',
    fontSize: 30,
    letterSpacing: 0.9,
    color: INK,
    marginVertical: -7.3
  },
  mark: { width: 14, height: 14 },
  markRing: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 6,
    borderWidth: 2.6,
    borderColor: INK
  },
  markDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e8320c'
  },
  button: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  }
})
