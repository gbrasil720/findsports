import { type ReactNode, useEffect } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

/*
 * A entrada das telas da apresentação. Cada tela tem um progresso de 0 a 1
 * (`ENTER_MS`) e cada elemento descreve o seu movimento em quadros-chave
 * sobre ele, como os `@keyframes` do design (`sp-pin`, `sp-drop`, `sp-lens`,
 * `sp-wipe`...): `at` é a fração do tempo, o resto é o estado naquele ponto.
 * O que o quadro não diz é o repouso (sem deslocamento, escala 1, opaco).
 */

export const ENTER_MS = 1800

export type Frame = {
  at: number
  x?: number
  y?: number
  scale?: number
  rotate?: number
  opacity?: number
}

const REST = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }

export function useKeyframes(progress: SharedValue<number>, frames: Frame[]) {
  return useAnimatedStyle(() => {
    const p = progress.value
    let i = 0
    while (i < frames.length - 2 && p > frames[i + 1].at) i++
    const a = frames[i]
    const b = frames[i + 1]
    const raw = Math.min(Math.max((p - a.at) / (b.at - a.at), 0), 1)
    // O `cubic-bezier(.23,1,.32,1)` do design, por trecho, como no CSS.
    const t = 1 - (1 - raw) ** 4
    const mix = (key: keyof typeof REST) => {
      const from = a[key] ?? REST[key]
      return from + ((b[key] ?? REST[key]) - from) * t
    }
    return {
      opacity: mix('opacity'),
      transform: [
        { translateX: mix('x') },
        { translateY: mix('y') },
        { scale: mix('scale') },
        { rotate: `${mix('rotate')}deg` }
      ]
    }
  })
}

/**
 * O progresso de uma tela. Começa pronto (`done`) para a tela que não vai
 * animar; anda uma vez só, quando `play` liga. Voltar a uma tela já vista não
 * repete nada: o progresso continua em 1.
 */
export function useEntrance(done: boolean, play: boolean) {
  const progress = useSharedValue(done ? 1 : 0)
  useEffect(() => {
    if (play && progress.value === 0) {
      progress.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.linear
      })
    }
  }, [play, progress])
  return progress
}

/** Um elemento que entra pelos `frames`. */
export function Enter({
  progress,
  frames,
  style,
  children,
  pointerEvents
}: {
  progress: SharedValue<number>
  frames: Frame[]
  style?: StyleProp<ViewStyle>
  children?: ReactNode
  pointerEvents?: 'none'
}) {
  const motion = useKeyframes(progress, frames)
  return (
    <Animated.View style={[style, motion]} pointerEvents={pointerEvents}>
      {children}
    </Animated.View>
  )
}
