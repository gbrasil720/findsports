import { RATING_STARS_MAX } from '@findsports_oficial/db/rating-limits'
import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { Icon } from '@/components/ui'

/*
 * Estrelas da avaliação (WEB-451). `Stars` só mostra; `StarPicker` é a
 * escolha do pós-jogo: tocar na terceira acende três, cada uma com um estalo
 * curto que corre da esquerda para a direita (25 ms entre elas; só as que
 * acendem agora), e a
 * escolhida vibra uma vez. Com "Reduzir movimento" o Reanimated pula o
 * estalo e a cor troca na hora.
 */

const STEPS = Array.from({ length: RATING_STARS_MAX }, (_, i) => i + 1)

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const palette = usePalette()
  const full = Math.floor(value)
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${value.toLocaleString('pt-BR')} de ${RATING_STARS_MAX} estrelas`}
      style={styles.row}
    >
      {STEPS.map((n) => (
        <Icon
          key={n}
          name="star"
          size={size}
          color={n <= full ? palette.ink : palette.dash}
        />
      ))}
    </View>
  )
}

export function StarPicker({
  value,
  onChange
}: {
  value: number | null
  onChange: (stars: number) => void
}) {
  // As que acendem agora estalam a partir da última acesa; baixar a nota só
  // apaga, sem estalo.
  const before = useRef(value ?? 0)
  const lit = before.current
  useEffect(() => {
    before.current = value ?? 0
  }, [value])
  return (
    <View accessibilityRole="radiogroup" style={styles.picker}>
      {STEPS.map((n) => (
        <PickStar
          key={n}
          n={n}
          on={value !== null && n <= value}
          selected={value === n}
          delay={Math.max(n - 1 - lit, 0) * 25}
          onPress={() => {
            if (value !== n) haptic.select()
            onChange(n)
          }}
        />
      ))}
    </View>
  )
}

function PickStar({
  n,
  on,
  selected,
  delay,
  onPress
}: {
  n: number
  on: boolean
  selected: boolean
  /** Quando estalar, se acender agora: a fileira corre da esquerda. */
  delay: number
  onPress: () => void
}) {
  const palette = usePalette()
  const scale = useSharedValue(1)
  // Só o `on` dispara: estrela que já estava acesa não estala de novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o atraso é lido no instante em que acende
  useEffect(() => {
    if (!on) return
    scale.set(
      withDelay(
        delay,
        withSequence(
          withTiming(1.2, { duration: 80, easing: EASE }),
          withSpring(1, { duration: 220, dampingRatio: 0.6 })
        )
      )
    )
  }, [on, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }]
  }))
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={n === 1 ? '1 estrela' : `${n} estrelas`}
      hitSlop={4}
      onPress={onPress}
      style={styles.pick}
    >
      <Animated.View style={style}>
        <Icon name="star" size={40} color={on ? palette.ink : palette.dash} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  picker: { flexDirection: 'row', gap: 4 },
  pick: { padding: 4 }
})
