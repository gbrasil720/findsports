import { maintenanceForecast } from '@findsports_oficial/api/lib/maintenance-forecast'
import { useRouter } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, { FadeIn, FadeInLeft, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  EASE,
  enterAt,
  haptic,
  LABEL_IN,
  usePressScale
} from '@/components/motion'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  PAPER,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import {
  type Maintenance,
  readTodayCode,
  useKeepTodayCode,
  useMaintenance
} from '@/lib/maintenance'

/*
 * "Voltamos já já." (26d claro, 26e escuro; WEB-466): a manutenção que o
 * Houdini liga. Cobre o app inteiro, por cima das telas; o código do jogo de
 * hoje abre por cima dela (tela cheia nativa), do que está guardado no
 * aparelho. Sem previsão, sem hora nem contagem. Quando a manutenção acaba,
 * a tela sai sozinha: é o "Avisamos aqui quando voltar".
 */

// Fundo e texto: acid e tinta no claro, tinta e papel no escuro (26e).
const SCREEN = themed(ACID, INK)
const FG = themed(INK, PAPER)
const EYEBROW = themed(INK, ACID)
const BOX = themed(INK, '#1c1c18')
const BOX_DROP = themed('rgba(18,18,15,.25)', ACID)
const BUTTON = themed(INK, ACID)
const ON_BUTTON = themed(ACID, INK)
const GREY = '#aaa9a4'

const BAND_HEIGHT = 46
/** As listras de 22 px a 135° do design, medidas na horizontal. */
const STRIPE = 22 * Math.SQRT2

/** A faixa de obra: listras de tinta sobre acid, a 45°, inclinada 6°. */
function Band({ width }: { width: number }) {
  const count = Math.ceil((width + BAND_HEIGHT) / (STRIPE * 2)) + 1
  const d = Array.from({ length: count }, (_, index) => {
    const x = index * STRIPE * 2 - BAND_HEIGHT
    return `M${x} ${BAND_HEIGHT}h${STRIPE}l${BAND_HEIGHT} -${BAND_HEIGHT}h-${STRIPE}z`
  }).join('')
  return (
    <View style={styles.band}>
      <View style={[styles.bandDrop, { width }]} />
      <Svg width={width} height={BAND_HEIGHT} style={{ backgroundColor: ACID }}>
        <Path d={d} fill={INK} />
      </Svg>
    </View>
  )
}

// A faixa entra de lado, como fita sendo esticada; o resto sobe em
// sequência (`enterAt`). Constantes de módulo (ver `components/motion.tsx`).
const BAND_IN = FadeInLeft.duration(520)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateX: -48 }] })
const SCREEN_IN = FadeIn.duration(200)
const SCREEN_OUT = FadeOut.duration(220)

/** Relógio que anda de 15 em 15 s: a contagem é em minutos. */
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function MaintenanceScreen({
  maintenance
}: {
  maintenance: Maintenance
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scheme = useColorScheme()
  const router = useRouter()
  const press = usePressScale(0.97)
  const now = useNow()
  const userId = authClient.useSession().data?.user.id
  const forecast = maintenanceForecast(maintenance.backAt, now)
  const code = readTodayCode(userId, now)

  useEffect(() => {
    setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark')
  }, [scheme])

  return (
    <View style={styles.screen}>
      <Animated.View
        entering={BAND_IN}
        style={[styles.bandWrap, { top: insets.top + 103 }]}
      >
        <Band width={width + 80} />
      </Animated.View>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 203,
            paddingBottom: Math.max(insets.bottom, 16) + 6
          }
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.body}>
          <Animated.View entering={enterAt(0, false)}>
            <Text style={styles.eyebrow}>INTERVALO TÉCNICO</Text>
          </Animated.View>
          <Animated.View entering={enterAt(1, false)} style={styles.title}>
            <Title lines={[['Voltamos'], ['já já.']]} size={60} color={FG} />
          </Animated.View>
          <Animated.View entering={enterAt(2, false)}>
            <Text style={[text(16, 'Regular', 1.5), styles.lead]}>
              Estamos fazendo uma manutenção no app. Os códigos dos jogos de
              hoje continuam valendo no balcão.
            </Text>
          </Animated.View>
          {forecast ? (
            <Animated.View entering={enterAt(3, false)} style={styles.boxWrap}>
              <View style={styles.boxDrop} />
              <View
                style={styles.box}
                accessible
                accessibilityLabel={`Previsão de volta ${forecast.time}. Faltam cerca de ${forecast.left}.`}
              >
                <View>
                  <Text style={[text(12.5), { color: GREY }]}>
                    Previsão de volta
                  </Text>
                  <Text style={[styles.big, { color: PAPER }]}>
                    {forecast.time}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={[text(12.5), { color: GREY }]}>
                    Faltam cerca de
                  </Text>
                  {/* O número novo sobe no lugar do antigo. */}
                  <Animated.View key={forecast.left} entering={LABEL_IN}>
                    <Text style={[styles.big, { color: ACID }]}>
                      {forecast.left}
                    </Text>
                  </Animated.View>
                </View>
              </View>
            </Animated.View>
          ) : null}
        </View>

        <Animated.View entering={enterAt(4, false)} style={styles.foot}>
          {code ? (
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
            >
              <Animated.View style={[styles.button, press.style]}>
                <Icon
                  name="ticket"
                  size={18}
                  color={ON_BUTTON}
                  accent={ON_BUTTON}
                />
                <Text
                  maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
                  numberOfLines={1}
                  style={[text(15, 'Bold'), { color: ON_BUTTON }]}
                >
                  Ver meu código de hoje
                </Text>
              </Animated.View>
            </Pressable>
          ) : null}
          <Text style={[text(13.5, 'SemiBold'), styles.notice]}>
            Avisamos aqui quando voltar
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  )
}

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
  screen: { flex: 1, backgroundColor: SCREEN, overflow: 'hidden' },
  bandWrap: { position: 'absolute', left: -40, right: -40 },
  band: { transform: [{ rotate: '-6deg' }] },
  bandDrop: {
    position: 'absolute',
    top: 6,
    left: 0,
    height: BAND_HEIGHT,
    backgroundColor: 'rgba(18,18,15,.15)'
  },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  body: { gap: 14 },
  eyebrow: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: EYEBROW
  },
  title: { marginVertical: 2 },
  lead: { color: FG, opacity: 0.85, maxWidth: 320 },
  boxWrap: { marginTop: 8 },
  boxDrop: {
    ...StyleSheet.absoluteFill,
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 7,
    backgroundColor: BOX_DROP
  },
  box: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 7,
    backgroundColor: BOX
  },
  right: { alignItems: 'flex-end', flexShrink: 1 },
  // Anton 34 do design, sem `lineHeight` (corta no iOS): margem negativa.
  big: {
    fontFamily: 'Anton',
    fontSize: 34,
    marginTop: 3 - 0.2425 * 34,
    marginBottom: -0.2425 * 34
  },
  foot: {
    marginTop: 'auto',
    paddingTop: 32,
    marginHorizontal: -4,
    gap: 10,
    alignItems: 'stretch'
  },
  button: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    backgroundColor: BUTTON
  },
  notice: { color: FG, opacity: 0.8, textAlign: 'center' }
})
