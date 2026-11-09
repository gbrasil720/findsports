import { createContext, useEffect } from 'react'
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { Text } from '@/components/ui'

/**
 * Se a splash já saiu. A tela de baixo espera por isso para animar a
 * entrada, que senão tocaria escondida (`app/intro.tsx`). Fora do provedor,
 * vale como saída.
 */
export const SplashDone = createContext(true)

/**
 * A splash do app (redesign, rodada 1, splash B "marca primeiro"): a torcida
 * em pontos de LED atrás da marca e, embaixo dela, quantos jogos há hoje.
 *
 * A marca é a mesma imagem da splash nativa (`app.json`), no mesmo centro: ela
 * está parada desde o primeiro quadro. O que entra é o telão, inteiro e de uma
 * vez, assentando com um leve recuo; depois 18% dos pontos piscam devagar, em
 * três grupos com ritmos diferentes. As imagens saem de
 * `scripts/splash/generate.ts`.
 */

/** A caixa da `mark.png`, em pt: a mesma do gerador e do `imageWidth` do `app.json`. */
const MARK_BOX = { width: 150, height: 136 }
/** O telão foi desenhado na tela do design (iPhone 16e). */
const LED = { width: 390, height: 844 }

const INK = '#12120f'
const PAPER = '#f1eee6'
const MUTED = '#aaa9a4'
const LIVE_ON_INK = '#f3421d'

/** `cubic-bezier(.16,1,.3,1)`, a curva do DESIGN.md. */
const ease = Easing.bezier(0.16, 1, 0.3, 1)
const ENTER = 320
/** Quando a saída começa: o telão aceso fica pouco mais de um segundo para ser lido. */
const HOLD_UNTIL = 1500
const EXIT = 220
/** Quanto cada grupo de pontos apaga no fundo do pisca (na landing, até 40%). */
const TWINKLE_DEPTH = 0.4
const TWINKLES = [
  { source: require('../assets/images/splash/twinkle-1.webp'), period: 2200 },
  { source: require('../assets/images/splash/twinkle-2.webp'), period: 2900 },
  { source: require('../assets/images/splash/twinkle-3.webp'), period: 3600 }
]

type Size = { width: number; height: number }

/** Um grupo de pontos que apaga e volta, em laço, depois que o telão acende. */
function Twinkle({
  source,
  period,
  size
}: {
  source: number
  period: number
  size: Size
}) {
  const dim = useSharedValue(0)
  useEffect(() => {
    const half = { duration: period / 2, easing: Easing.inOut(Easing.sin) }
    dim.value = withDelay(
      ENTER,
      withRepeat(
        withSequence(withTiming(TWINKLE_DEPTH, half), withTiming(0, half)),
        -1
      )
    )
  }, [dim, period])
  const style = useAnimatedStyle(() => ({ opacity: dim.value }))
  return <Animated.Image source={source} style={[styles.layer, size, style]} />
}

export type TodayGames = { games: number; live: number }

export function Splash({
  today,
  onDone
}: {
  /** Os jogos de hoje; sem eles (nenhum, ou a API não respondeu), "O jogo é aqui". */
  today?: TodayGames
  onDone: () => void
}) {
  const window = useWindowDimensions()
  const reduced = useReducedMotion()
  // O telão cobre a tela (`cover`): no tablet ele cresce e corta as bordas.
  const cover = Math.max(window.width / LED.width, window.height / LED.height)
  const size = { width: LED.width * cover, height: LED.height * cover }
  const lit = useSharedValue(0)
  const exit = useSharedValue(0)

  useEffect(() => {
    lit.value = withTiming(1, { duration: ENTER, easing: ease })
    exit.value = withDelay(
      HOLD_UNTIL,
      withTiming(1, { duration: EXIT, easing: ease })
    )
    const done = setTimeout(onDone, HOLD_UNTIL + EXIT)
    return () => clearTimeout(done)
  }, [exit, lit, onDone])

  // Com menos movimento, o telão só acende: sem o recuo e sem o pisca.
  const ledStyle = useAnimatedStyle(() => ({
    opacity: lit.value,
    transform: [{ scale: reduced ? 1 : 1.04 - 0.04 * lit.value }]
  }))
  const exitStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }))

  const games = today?.games ?? 0
  const live = today?.live ?? 0
  const count = `${games} ${games === 1 ? 'JOGO' : 'JOGOS'} HOJE`

  return (
    <Animated.View
      accessibilityLabel={
        games > 0
          ? `Onside. ${count.toLowerCase()}${live > 0 ? `, ${live} ao vivo` : ''}.`
          : 'Onside. O jogo é aqui.'
      }
      accessible
      style={[StyleSheet.absoluteFill, styles.stage, exitStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.center, ledStyle]}>
        <Image
          source={require('../assets/images/splash/led.webp')}
          style={[styles.layer, size]}
        />
        {reduced
          ? null
          : TWINKLES.map((twinkle) => (
              <Twinkle key={twinkle.period} {...twinkle} size={size} />
            ))}
      </Animated.View>
      <View pointerEvents="none" style={styles.center}>
        <Image
          source={require('../assets/images/splash/mark.png')}
          style={MARK_BOX}
        />
        {/* Fora do fluxo, para a marca ficar no centro exato, como na nativa. */}
        <Text numberOfLines={1} style={styles.sub}>
          {games > 0 ? (
            <>
              <Text style={styles.strong}>{count}</Text>
              {live > 0 ? (
                <>
                  {' · '}
                  <Text style={styles.live}>● {live} AO VIVO</Text>
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.strong}>O JOGO É AQUI</Text>
          )}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  stage: { backgroundColor: INK, overflow: 'hidden' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Absoluta e sem posição: o pai a centra, maior que a tela se precisar.
  layer: { position: 'absolute' },
  // A Geist Mono tem 1,3em de altura natural; o design pede 1em, e um
  // `lineHeight` menor cortaria o topo no iOS.
  sub: {
    position: 'absolute',
    top: '50%',
    marginTop: MARK_BOX.height / 2 + 14,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: MUTED
  },
  strong: { color: PAPER },
  live: { color: LIVE_ON_INK }
})
