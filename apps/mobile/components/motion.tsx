import * as Haptics from 'expo-haptics'
import { type ReactNode, useEffect } from 'react'
import { type StyleProp, Text, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  Keyframe,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn
} from 'react-native-reanimated'

/*
 * Movimento das telas de conta: entrada em sequência, pressão dos botões,
 * erro que treme, flutuação, cursor e o háptico de cada gesto. A curva é a
 * do design, `cubic-bezier(.23,1,.32,1)`. Quem pede menos movimento no
 * sistema não vê nada disso: o Reanimated pula para o fim
 * (`ReduceMotion.System`, o padrão).
 */

export const EASE = Easing.bezier(0.23, 1, 0.32, 1)

/** Háptico de cada gesto. Sem motor de vibração, não faz nada. */
const quiet = () => {}
export const haptic = {
  tap: () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(quiet),
  select: () => Haptics.selectionAsync().catch(quiet),
  success: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      quiet
    ),
  error: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      quiet
    )
}

// Entradas prontas. Constantes de propósito: o Reanimated 4 recomeça a
// entrada quando o objeto em `entering` muda, e um `ZoomIn.delay(...)` escrito
// no JSX é um objeto novo a cada renderização (uma contagem de segundos
// fazia o elemento aparecer de novo a cada segundo).
export const POP = ZoomIn.springify().damping(15)
export const POP_FAST = ZoomIn.duration(180).easing(EASE)
export const POP_LATE = ZoomIn.delay(650).springify().damping(15)
export const SWAP = FadeIn.duration(170)

/**
 * A entrada do elemento `index` de uma tela: sobe e aparece, um depois do
 * outro. Quem nasce depois (um erro, um aviso) entra na hora, sem fila.
 */
export const enterAt = (index: number, late: boolean) =>
  late
    ? FadeInDown.duration(260).easing(EASE)
    : FadeInDown.delay(60 + index * 55)
        .duration(480)
        .easing(EASE)

/**
 * Afundar ao toque: o botão anda até cobrir a própria sombra dura (`x`, `y`)
 * e volta com mola.
 */
export function usePress(x: number, y: number) {
  const down = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: down.value * x }, { translateY: down.value * y }]
  }))
  return {
    style,
    onPressIn: () => {
      down.value = withTiming(1, { duration: 70 })
    },
    onPressOut: () => {
      down.value = withSpring(0, { damping: 14, stiffness: 320 })
    }
  }
}

/** Tremida curta de erro, para chamar `shake()` quando algo falha. */
export function useShake() {
  const x = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }]
  }))
  const shake = () => {
    x.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(7, { duration: 60 }),
      withTiming(-5, { duration: 60 }),
      withTiming(3, { duration: 60 }),
      withTiming(0, { duration: 60 })
    )
  }
  return { style, shake }
}

const SHAKE_IN = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 0 }] },
  20: { opacity: 1, transform: [{ translateX: -7 }] },
  40: { transform: [{ translateX: 6 }] },
  60: { transform: [{ translateX: -4 }] },
  80: { transform: [{ translateX: 2 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }] }
}).duration(380)

/** Mensagem de erro: entra tremendo, com o háptico de erro. */
export function ErrorText({
  children,
  style
}: {
  children: string | null
  style?: StyleProp<TextStyle>
}) {
  useEffect(() => {
    if (children) haptic.error()
  }, [children])
  if (!children) return null
  return (
    <Animated.View key={children} entering={SHAKE_IN}>
      <Text accessibilityRole="alert" style={style}>
        {children}
      </Text>
    </Animated.View>
  )
}

/** Sobe e desce devagar, sem parar (o envelope das telas de e-mail). */
export function Float({
  children,
  distance = 6
}: {
  children: ReactNode
  distance?: number
}) {
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withRepeat(
      withTiming(-distance, {
        duration: 1600,
        easing: Easing.inOut(Easing.sin)
      }),
      -1,
      true
    )
  }, [distance, y])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }]
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

/** Pisca como cursor de texto. */
export function useBlink() {
  const value = useSharedValue(1)
  useEffect(() => {
    value.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 450 }),
        withTiming(0, { duration: 80 }),
        withTiming(0, { duration: 370 }),
        withTiming(1, { duration: 80 })
      ),
      -1
    )
  }, [value])
  const style = useAnimatedStyle(() => ({ opacity: value.value }))
  return { style }
}
