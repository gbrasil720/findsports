import { useEffect, useId, useState } from 'react'
import { StyleSheet, Text, type TextStyle, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText
} from 'react-native-svg'
import { text } from '@/components/ui'
import type { AiPalette } from './theme'

/*
 * "Carregando" (Shimmer · Loader): o giro e o texto com brilho, só no passo
 * em andamento, nunca na tela inteira. Com menos movimento, o giro para e o
 * texto fica liso.
 */

/** O giro: anel com dois lados na cor de destaque (11, 14 ou 16-18 pt). */
export function Spinner({
  size,
  palette
}: {
  size: number
  palette: AiPalette
}) {
  const turn = useSharedValue(0)
  useEffect(() => {
    turn.set(
      withRepeat(
        withTiming(1, { duration: 750, easing: Easing.linear }),
        -1,
        false
      )
    )
  }, [turn])
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.get() * 360}deg` }]
  }))
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: palette.spinTrack,
          borderTopColor: palette.spin,
          borderRightColor: palette.spin
        },
        spin
      ]}
    />
  )
}

const AnimatedRect = Animated.createAnimatedComponent(Rect)
// Métricas da Archivo (hhea): a linha de base fica a 0,878 em do topo da
// fonte, e o React Native centra a fonte (0,878 + 0,21 em) na linha.
const ASCENT = 0.878
const DESCENT = 0.21

/**
 * Texto com brilho: uma faixa clara passa da esquerda para a direita, no
 * degradê do design (apagado, claro a 45%, apagado a 90%). Uma linha só.
 */
export function Shimmer({
  children,
  size,
  weight = 'SemiBold',
  palette
}: {
  children: string
  size: number
  weight?: 'Regular' | 'SemiBold' | 'Bold'
  palette: AiPalette
}) {
  const reduced = useReducedMotion()
  const id = useId().replace(/:/g, '')
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const sweep = useSharedValue(0)
  useEffect(() => {
    sweep.set(
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.linear }),
        -1,
        false
      )
    )
  }, [sweep])
  const w = box?.w ?? 0
  // A faixa tem o dobro da largura e anda de fora a fora.
  const band = useAnimatedProps(() => ({ x: -2 * w + sweep.get() * 3 * w }))
  const style: TextStyle = { ...text(size, weight, 1.4) }
  const lineHeight = style.lineHeight ?? size * 1.4
  const baseline = (lineHeight - (ASCENT + DESCENT) * size) / 2 + ASCENT * size
  const plain = reduced || !box
  return (
    <View>
      <Text
        numberOfLines={1}
        onLayout={(e) =>
          setBox({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height
          })
        }
        style={[style, { color: plain ? palette.muted : 'transparent' }]}
      >
        {children}
      </Text>
      {plain ? null : (
        <Svg
          pointerEvents="none"
          width={box.w}
          height={box.h}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={palette.muted} />
              <Stop offset="0.45" stopColor={palette.ink} />
              <Stop offset="0.9" stopColor={palette.muted} />
            </LinearGradient>
            <ClipPath id={`c${id}`}>
              <SvgText
                x={0}
                y={baseline}
                fontFamily={`Archivo-${weight}`}
                fontSize={size}
              >
                {children}
              </SvgText>
            </ClipPath>
          </Defs>
          <G clipPath={`url(#c${id})`}>
            <Rect width={box.w} height={box.h} fill={palette.muted} />
            <AnimatedRect
              animatedProps={band}
              y={0}
              width={box.w * 2}
              height={box.h}
              fill={`url(#g${id})`}
            />
          </G>
        </Svg>
      )}
    </View>
  )
}
