import * as Haptics from 'expo-haptics'
import { type ReactNode, useEffect } from 'react'
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from 'react-native'
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  FadeIn,
  FadeInDown,
  Keyframe,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { Text } from '@/components/text'

/*
 * Movimento das telas de conta: entrada em sequência, pressão dos botões,
 * erro que treme, flutuação, cursor e o háptico de cada gesto. A curva é a
 * do design, `cubic-bezier(.23,1,.32,1)`. Quem pede menos movimento no
 * sistema não vê nada disso: o Reanimated pula para o fim
 * (`ReduceMotion.System`, o padrão).
 */

export const EASE = Easing.bezier(0.23, 1, 0.32, 1)

/**
 * Háptico: um por ação, no momento em que ela acontece (escolher, dar certo,
 * dar errado). Toque em botão não vibra; o botão já afunda. Sem motor de
 * vibração, não faz nada.
 */
const quiet = () => {}
export const haptic = {
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
/**
 * Estalo: nasce em `from` (nunca em zero: nada aparece do nada) e assenta
 * numa mola curta, com um pouco de passo além.
 */
export const popFrom = (
  from: number,
  delay = 0
): EntryExitAnimationFunction => {
  return () => {
    'worklet'
    return {
      initialValues: { opacity: 0, transform: [{ scale: from }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 120 })),
        transform: [
          {
            scale: withDelay(
              delay,
              withSpring(1, { duration: 300, dampingRatio: 0.7 })
            )
          }
        ]
      }
    }
  }
}
export const POP = popFrom(0.6)
export const POP_FAST = popFrom(0.8)
export const POP_LATE = popFrom(0.6, 650)
export const SWAP = FadeIn.duration(150)

/**
 * A entrada do elemento `index` de uma tela: sobe e aparece, um depois do
 * outro. Quem nasce depois (um erro, um aviso) entra na hora, sem fila.
 */
// Curta e perto: a tela já chega deslizando pela pilha, e o conteúdo só
// assenta (8 px, 260 ms, 35 ms entre os primeiros, nada depois do sexto).
export const enterAt = (index: number, late: boolean) =>
  (late
    ? FadeInDown.duration(200)
    : FadeInDown.delay(40 + Math.min(index, 5) * 35).duration(260)
  )
    .easing(EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })

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
    // Afunda já no toque (a resposta que se sente) e solta um pouco mais
    // devagar, sem mola: botão não quica.
    onPressIn: () => {
      down.value = withTiming(1, { duration: 90, easing: EASE })
    },
    onPressOut: () => {
      down.value = withTiming(0, { duration: 160, easing: EASE })
    }
  }
}

/**
 * Encolher ao toque (cards, linhas, botões sem sombra dura): vai a `to` em
 * 120 ms no toque e volta em 160 ms, com a curva do design. Num quadro só a
 * pressão parecia um salto.
 */
export function usePressScale(to = 0.97) {
  const down = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - down.get() * (1 - to) }]
  }))
  return {
    style,
    onPressIn: () => {
      down.set(withTiming(1, { duration: 120, easing: EASE }))
    },
    onPressOut: () => {
      down.set(withTiming(0, { duration: 160, easing: EASE }))
    }
  }
}

/**
 * Algo tocável que afunda de leve no toque (0,97 em 120 ms, volta em 160 ms):
 * cartões e tiles das telas de busca, filtros e avisos. `style` vai na parte
 * que afunda.
 */
export function ScalePress({
  to = 0.97,
  style,
  containerStyle,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  to?: number
  style?: StyleProp<ViewStyle>
  /** Layout do lado de fora (um `flex: 1` numa fileira). */
  containerStyle?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const press = usePressScale(to)
  return (
    <Pressable
      {...props}
      style={containerStyle}
      onPressIn={(e) => {
        press.onPressIn()
        props.onPressIn?.(e)
      }}
      onPressOut={(e) => {
        press.onPressOut()
        props.onPressOut?.(e)
      }}
    >
      <Animated.View style={[style, press.style]}>{children}</Animated.View>
    </Pressable>
  )
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
